-- Step 1: accounts (docs/backend-design.md §3, §4.4, §6.1).
-- A member is one person's account in one community (D17). Profile columns (status, district,
-- birth dates, photos, score, ...) arrive with profiles in step 3.

-- RLS helpers live in `private`, which the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role, supabase_auth_admin;

-- ---------------------------------------------------------------------------------------------
-- Tables

create table public.platform_admins (
  user_id uuid primary key references auth.users on delete cascade
);

create table public.members (
  community_id uuid not null references public.communities on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  -- Fixed after sign-up (D19). No '@', so the login field can tell a username from an email.
  username text not null check (
    char_length(username) between 3 and 32
    and username = btrim(username)
    and strpos(username, '@') = 0
    and username !~ '[[:cntrl:]]'
  ),
  role text not null default 'member' check (role in ('member', 'admin')),
  can_create_groups boolean not null default false,
  state text not null default 'profile' check (state in ('profile', 'applied', 'approved', 'rejected', 'removed')),
  is_system boolean not null default false, -- the No-reply account
  locale text check (locale ~ '^[a-z]{2}$'), -- null = community default
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create unique index members_username_uq on public.members (community_id, lower(username));
create index members_user on public.members (user_id, community_id);
create index members_state on public.members (community_id, state);

-- ---------------------------------------------------------------------------------------------
-- Helpers. security definer so policies can ask "who am I here" without recursing into RLS.

create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

-- Has an account in the community that is not rejected or removed (applicants included).
create function private.is_member(p_community uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where community_id = p_community and user_id = (select auth.uid())
      and state in ('profile', 'applied', 'approved')
  )
$$;

create function private.is_approved(p_community uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where community_id = p_community and user_id = (select auth.uid()) and state = 'approved'
  )
$$;

create function private.is_community_admin(p_community uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where community_id = p_community and user_id = (select auth.uid())
      and state = 'approved' and role = 'admin'
  )
$$;

-- Set versions for list policies: `community_id in (select ...)` runs once per query, not per row.
create function private.approved_communities() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select community_id from public.members where user_id = (select auth.uid()) and state = 'approved'
$$;

create function private.admin_communities() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select community_id from public.members
  where user_id = (select auth.uid()) and state = 'approved' and role = 'admin'
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Security

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated;

create policy platform_admins_read_own on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Communities: the platform admin creates and edits them (read stays public, step 0).
grant insert, update on public.communities to authenticated;

create policy communities_create on public.communities
  for insert to authenticated
  with check ((select private.is_platform_admin()));

create policy communities_edit on public.communities
  for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

-- Members. Applicants see only themselves; approved members see approved members;
-- the community admin sees everyone in the community. Blocks are added in step 6.
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;
grant select on public.members to authenticated;

create policy members_read on public.members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (state = 'approved' and community_id in (select private.approved_communities()))
    or community_id in (select private.admin_communities())
  );

-- Joining a second community with an existing login (D17). Only these columns can be given,
-- so role, state and the rest always start at their defaults.
grant insert (community_id, user_id, username) on public.members to authenticated;

create policy members_join on public.members
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Recording a login. The trigger below always stamps now(), so the value can't be faked.
grant update (last_login_at) on public.members to authenticated;

create policy members_record_login on public.members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function private.stamp_last_login() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.last_login_at := now();
  return new;
end
$$;

create trigger members_stamp_last_login
  before update of last_login_at on public.members
  for each row execute function private.stamp_last_login();

-- ---------------------------------------------------------------------------------------------
-- Sign-up: the join form passes community_id + username as user metadata; the member row is
-- created in the same transaction as the login, so a taken username fails the whole sign-up.

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_community uuid := nullif(new.raw_user_meta_data ->> 'community_id', '')::uuid;
  v_username text := btrim(new.raw_user_meta_data ->> 'username');
begin
  if v_community is null or v_username is null then
    return new;
  end if;
  insert into public.members (community_id, user_id, username) values (v_community, new.id, v_username);
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Server-only lookups (service role). Never callable from the browser.

-- Log in with a username: the email behind it, or null.
create function public.member_email(p_community uuid, p_username text) returns text
language sql stable security definer set search_path = '' as $$
  select u.email
  from public.members m
  join auth.users u on u.id = m.user_id
  where m.community_id = p_community
    and lower(m.username) = lower(btrim(p_username))
    and not m.is_system
$$;

-- Join form: is the username free here, and does the email already have a login?
create function public.join_check(p_community uuid, p_username text, p_email text)
returns table (username_taken boolean, email_exists boolean)
language sql stable security definer set search_path = '' as $$
  select
    exists (
      select 1 from public.members
      where community_id = p_community and lower(username) = lower(btrim(p_username))
    ),
    exists (select 1 from auth.users where email = lower(btrim(p_email)))
$$;

revoke execute on function public.member_email(uuid, text) from public, anon, authenticated;
revoke execute on function public.join_check(uuid, text, text) from public, anon, authenticated;
grant execute on function public.member_email(uuid, text) to service_role;
grant execute on function public.join_check(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- No-reply: one system login (no password, banned) with a member account in every community.
-- It sends automatic DMs such as "You are now a member of the group".

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, banned_until,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'no-reply@system.invalid', '', now(), 'infinity',
  '{"provider": "email", "providers": ["email"], "system": true}', '{}', now(), now(),
  '', '', '', ''
);

create function private.add_system_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.members (community_id, user_id, username, state, is_system)
  values (new.id, '00000000-0000-4000-8000-000000000001', 'No-reply', 'approved', true);
  return new;
end
$$;

create trigger communities_add_system_member
  after insert on public.communities
  for each row execute function private.add_system_member();

insert into public.members (community_id, user_id, username, state, is_system)
select id, '00000000-0000-4000-8000-000000000001', 'No-reply', 'approved', true
from public.communities;
