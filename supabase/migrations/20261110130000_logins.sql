-- Step 17b: a login per site (client decision 261102, Q12 option b). The same email is a separate
-- login, with its own password, on every site (domain); a login only reaches communities of its site.
--
-- Supabase Auth allows one login per email, so the email it holds becomes an internal address the
-- server makes up (<random>@<site>.login.invalid) and never shows. public.logins holds the site and
-- the real email. The server finds the login by site + email (or community + username), then signs
-- in with the internal address. The sign-up and reset codes are ours (private.login_codes), sent by
-- the app through Brevo: Supabase Auth sends no email any more.
--
-- Logins from before this step keep their real email as the internal address; they work the same.
--
-- Live-safe (docs/prod-db-changes-steps-9-11.md §5): this only adds, and replaces two functions with
-- the same arguments and results (handle_new_user, decide_application). The old build's sign-up still
-- gets its logins row (the trigger falls back to the Auth email and the community's site). Its
-- member_email and join_check stay until the new build is deployed
-- (supabase/deferred/20261110_drop_siteless_logins.sql).

-- ---------------------------------------------------------------------------------------------
-- Tables

create table public.logins (
  user_id uuid primary key references auth.users on delete cascade,
  site text not null check (site ~ '^[a-z0-9-]{2,40}$'), -- communities.site
  -- The real address, lower-cased: where the codes and the approval email go.
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 320 and strpos(email, '@') > 1),
  created_at timestamptz not null default now()
);

-- The lookup of every log-in, sign-up and reset by email: one row by (site, email).
create unique index logins_site_email_uq on public.logins (site, email);

-- Server only: read and written through the functions below (security definer), never by a client.
alter table public.logins enable row level security;
revoke all on public.logins from public, anon, authenticated;

-- One open code per login and kind; a new one replaces it. Only a hash is kept. A login's rows go
-- with the login, so the table never outgrows the logins.
create table private.login_codes (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('signup', 'reset')),
  code_hash text not null,
  -- Sign-up only: a hash of the token in the cookie of the browser that proved the password, so a
  -- code only confirms a sign-up in that browser (see signup_confirm).
  holder_hash text,
  tries smallint not null default 0,
  expires_at timestamptz not null,
  primary key (user_id, kind)
);
revoke all on private.login_codes from public, anon, authenticated;

-- Logins from before this step: the site of their communities ('main' today), the Auth email as it is.
insert into public.logins (user_id, site, email)
select u.id,
  coalesce((
    select c.site from public.members m join public.communities c on c.id = m.community_id
    where m.user_id = u.id order by m.created_at limit 1
  ), 'main'),
  lower(btrim(u.email))
from auth.users u
where u.email is not null and u.id <> '00000000-0000-4000-8000-000000000001'
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- A login only has accounts in communities of its own site, whatever path creates the account.

create function private.check_member_site() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_system then
    return new;
  end if;
  if not exists (
    select 1 from public.logins l join public.communities c on c.site = l.site
    where l.user_id = new.user_id and c.id = new.community_id
  ) then
    raise exception 'this login is not for this community''s site' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger members_check_site
  before insert on public.members
  for each row execute function private.check_member_site();

-- Sign-up: the login row, then (when the join form gave a community) the member row and the
-- consents, all in the transaction that creates the Auth user: a taken email or username, or a
-- missing consent, fails the whole sign-up. The server passes site + login_email as user metadata.
-- Without them (a build older than this step) the login is the Auth email on the community's site.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_community uuid := nullif(new.raw_user_meta_data ->> 'community_id', '')::uuid;
  v_username text := btrim(new.raw_user_meta_data ->> 'username');
  v_site text := nullif(new.raw_user_meta_data ->> 'site', '');
  v_email text := nullif(lower(btrim(new.raw_user_meta_data ->> 'login_email')), '');
begin
  if v_site is null or v_email is null then
    v_site := (select site from public.communities where id = v_community);
    v_email := lower(btrim(new.email));
  end if;
  if v_site is not null and v_email is not null then
    insert into public.logins (user_id, site, email) values (new.id, v_site, v_email);
  end if;
  if v_community is null or v_username is null then
    return new;
  end if;
  insert into public.members (community_id, user_id, username) values (v_community, new.id, v_username);
  perform private.save_consents(v_community, new.id, new.raw_user_meta_data -> 'consents');
  return new;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Codes

create function private.code_hash(p_user uuid, p_code text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_user::text || ':' || p_code, 'sha256'), 'hex')
$$;

-- A new 6-digit code for the login, replacing any open one. An hour to use it, 5 tries.
create function private.new_login_code(p_user uuid, p_kind text, p_holder_hash text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
begin
  insert into private.login_codes (user_id, kind, code_hash, holder_hash, tries, expires_at)
  values (p_user, p_kind, private.code_hash(p_user, v_code), p_holder_hash, 0, now() + interval '1 hour')
  on conflict (user_id, kind) do update
    set code_hash = excluded.code_hash, holder_hash = excluded.holder_hash, tries = 0, expires_at = excluded.expires_at;
  return v_code;
end
$$;

-- Is this the login's open code? A right code is used up; a wrong one counts as a try. p_holder_hash
-- must match when the code was made for one browser.
create function private.take_login_code(p_user uuid, p_kind text, p_code text, p_holder_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_row private.login_codes;
begin
  select * into v_row from private.login_codes where user_id = p_user and kind = p_kind for update;
  if not found or v_row.expires_at < now() or v_row.tries >= 5 then
    return false;
  end if;
  if v_row.holder_hash is distinct from p_holder_hash or v_row.code_hash <> private.code_hash(p_user, coalesce(p_code, '')) then
    update private.login_codes set tries = tries + 1 where user_id = p_user and kind = p_kind;
    return false;
  end if;
  delete from private.login_codes where user_id = p_user and kind = p_kind;
  return true;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Server-only lookups and steps (service role). Never callable from the browser.

-- Log in, forgot password: the login behind an email on this site, or behind a username in this
-- community (which must be on this site). auth_email is what Supabase Auth signs in with.
create function public.login_lookup(p_site text, p_community uuid, p_login text)
returns table (user_id uuid, auth_email text, email text, confirmed boolean)
language sql stable security definer set search_path = '' as $$
  select l.user_id, u.email::text, l.email, u.email_confirmed_at is not null
  from public.logins l
  join auth.users u on u.id = l.user_id
  where l.site = p_site
    and case
      when strpos(p_login, '@') > 0 then l.email = lower(btrim(p_login))
      else l.user_id = (
        select m.user_id from public.members m
        where m.community_id = p_community and lower(m.username) = lower(btrim(p_login)) and not m.is_system
      )
    end
$$;

-- Join form, before anything is created. A sign-up for this email that was never confirmed is
-- removed first (with its account and username): nobody holds an email or a username with an
-- unconfirmed sign-up, and the password that counts is the one typed by whoever confirms.
-- Then: is the username free here, and does the email have a (confirmed) login on this site?
create function public.join_prepare(p_site text, p_community uuid, p_username text, p_email text)
returns table (username_taken boolean, user_id uuid, auth_email text)
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if not exists (select 1 from public.communities c where c.id = p_community and c.site = p_site) then
    raise exception 'no such community on this site' using errcode = '22023';
  end if;
  delete from auth.users u using public.logins l
  where l.user_id = u.id and l.site = p_site and l.email = v_email and u.email_confirmed_at is null;

  return query
  select
    exists (select 1 from public.members m where m.community_id = p_community and lower(m.username) = lower(btrim(p_username))),
    l.user_id, u.email::text
  from (select 1) as one
  left join public.logins l on l.site = p_site and l.email = v_email
  left join auth.users u on u.id = l.user_id;
end
$$;

-- A code for a sign-up (after it is created, or after a log-in that proved the password of an
-- unconfirmed login) or for a password reset. p_holder_hash: sign-up only, see login_codes.
create function public.login_code_new(p_user uuid, p_kind text, p_holder_hash text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('signup', 'reset') or (p_kind = 'signup') <> (p_holder_hash is not null) then
    raise exception 'login_code_new: a sign-up code needs a holder, a reset code has none' using errcode = '22023';
  end if;
  return private.new_login_code(p_user, p_kind, p_holder_hash);
end
$$;

-- "Send a new code" on the confirm step: only for the browser that holds the sign-up, and only
-- while the login is unconfirmed. Returns the new code, or nothing.
create function public.signup_resend(p_site text, p_email text, p_holder_hash text)
returns table (user_id uuid, code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  select l.user_id into v_user
  from public.logins l
  join auth.users u on u.id = l.user_id
  join private.login_codes c on c.user_id = l.user_id and c.kind = 'signup'
  where l.site = p_site and l.email = lower(btrim(p_email))
    and u.email_confirmed_at is null and c.holder_hash = p_holder_hash;
  if v_user is null then
    return;
  end if;
  return query select v_user, private.new_login_code(v_user, 'signup', p_holder_hash);
end
$$;

-- The code from the sign-up email. Returns the login when it is right; the server then confirms it
-- and signs the person in.
create function public.signup_confirm(p_site text, p_email text, p_code text, p_holder_hash text)
returns table (user_id uuid, auth_email text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_auth text;
begin
  select l.user_id, u.email into v_user, v_auth
  from public.logins l join auth.users u on u.id = l.user_id
  where l.site = p_site and l.email = lower(btrim(p_email)) and u.email_confirmed_at is null;
  if v_user is null or p_holder_hash is null or not private.take_login_code(v_user, 'signup', p_code, p_holder_hash) then
    return;
  end if;
  return query select v_user, v_auth;
end
$$;

-- The code from the reset email. When it is right, every session of the login ends (whoever had
-- the old password is out) and the login is returned; the server then sets the new password.
create function public.reset_confirm(p_site text, p_community uuid, p_login text, p_code text)
returns table (user_id uuid, auth_email text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_auth text;
begin
  select k.user_id, k.auth_email into v_user, v_auth from public.login_lookup(p_site, p_community, p_login) k;
  if v_user is null or not private.take_login_code(v_user, 'reset', p_code, null) then
    return;
  end if;
  delete from auth.sessions s where s.user_id = v_user;
  return query select v_user, v_auth;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- The approval email goes to the real address. decide_application (20261021120000_groups.sql) read
-- it from auth.users, which now holds the internal address; the one line is swapped in place, so the
-- rest of the function stays exactly as it is.
do $$
declare
  v_old constant text := 'select u.email into v_email from auth.users u where u.id = v_app.user_id;';
  v_new constant text := 'select l.email into v_email from public.logins l where l.user_id = v_app.user_id;';
  v_def text;
  v_count integer := 0;
begin
  for v_def in
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f' and strpos(p.prosrc, v_old) > 0
  loop
    execute replace(v_def, v_old, v_new);
    v_count := v_count + 1;
  end loop;
  if v_count <> 1 then
    raise exception 'expected to rewrite decide_application only, rewrote % functions', v_count;
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function
  private.check_member_site(), private.code_hash(uuid, text), private.new_login_code(uuid, text, text),
  private.take_login_code(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function
  public.login_lookup(text, uuid, text), public.join_prepare(text, uuid, text, text), public.login_code_new(uuid, text, text),
  public.signup_resend(text, text, text), public.signup_confirm(text, text, text, text), public.reset_confirm(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  public.login_lookup(text, uuid, text), public.join_prepare(text, uuid, text, text), public.login_code_new(uuid, text, text),
  public.signup_resend(text, text, text), public.signup_confirm(text, text, text, text), public.reset_confirm(text, uuid, text, text)
  to service_role;
