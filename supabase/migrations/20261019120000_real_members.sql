-- Step 5b: own domains, real members and privacy basics (docs/backend-design.md D30–D32, §6.1,
-- §6.2, §6.17, §7). Generic for every community:
-- 1. A community can have its own domain (the proxy maps the host; this column is the source for
--    links and emails).
-- 2. Per community: require 18+ at sign-up, and an identity check (an ID photo with the
--    application, reviewed by hand by the community admin).
-- 3. Consent at sign-up, stored with the version agreed to. Joining a second community now goes
--    through join_community, so nobody joins without the consents (no direct insert any more).
-- 4. Identity material (the application image and the ID photo) is deleted as soon as the
--    application is approved or rejected: the rows here, the files by the server right after.

-- ---------------------------------------------------------------------------------------------
-- Communities

alter table public.communities
  add column domain text unique check (domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'),
  add column require_age_18 boolean not null default false,
  add column require_identity boolean not null default false,
  -- The privacy text members agree to at sign-up (its date, e.g. '2026-10-19'). A new version is a
  -- new value; members' consents keep the version they agreed to.
  add column privacy_version text not null default '2026-10-19' check (char_length(privacy_version) between 1 and 40);

-- ---------------------------------------------------------------------------------------------
-- Consents

create table public.member_consents (
  community_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('privacy', 'age_18')), -- 'terms' when the client provides terms
  version text not null check (char_length(version) between 1 and 40),
  given_at timestamptz not null default now(),
  primary key (community_id, user_id, kind, version),
  foreign key (community_id, user_id) references public.members on delete cascade
);

-- Never edited by clients: written only by sign-up and join_community. Readable by the member and
-- the community admin.
alter table public.member_consents enable row level security;
revoke all on public.member_consents from anon, authenticated;
grant select on public.member_consents to authenticated;

create policy member_consents_read on public.member_consents
  for select to authenticated
  using (user_id = (select auth.uid()) or community_id in (select private.admin_communities()));

-- p_consents: {"privacy": "<version>", "age_18": true}. The privacy version must be the community's
-- current one; 18+ only when the community requires it. Missing → 23502 (nothing is saved).
create function private.save_consents(p_community uuid, p_user uuid, p_consents jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_community public.communities;
begin
  select * into v_community from public.communities where id = p_community;
  if not found then
    raise exception 'no such community' using errcode = '22023';
  end if;
  if jsonb_typeof(p_consents) is distinct from 'object'
    or p_consents ->> 'privacy' is distinct from v_community.privacy_version
    or (v_community.require_age_18 and p_consents -> 'age_18' is distinct from 'true'::jsonb) then
    raise exception 'consent missing' using errcode = '23502';
  end if;

  insert into public.member_consents (community_id, user_id, kind, version)
  values (p_community, p_user, 'privacy', v_community.privacy_version)
  on conflict do nothing;
  if v_community.require_age_18 then
    insert into public.member_consents (community_id, user_id, kind, version)
    values (p_community, p_user, 'age_18', '1')
    on conflict do nothing;
  end if;
end
$$;

-- Sign-up (a new email): the member row and the consents in the same transaction as the login,
-- so a missing consent fails the whole sign-up. The join form passes them as user metadata.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_community uuid := nullif(new.raw_user_meta_data ->> 'community_id', '')::uuid;
  v_username text := btrim(new.raw_user_meta_data ->> 'username');
begin
  if v_community is null or v_username is null then
    return new;
  end if;
  insert into public.members (community_id, user_id, username) values (v_community, new.id, v_username);
  perform private.save_consents(v_community, new.id, new.raw_user_meta_data -> 'consents');
  return new;
end
$$;

-- Joining a second community with an existing login (D17): the account and its consents together.
-- Replaces the direct insert into members, which could skip the consents.
create function public.join_community(p_community uuid, p_username text, p_consents jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'log in first' using errcode = '42501';
  end if;
  insert into public.members (community_id, user_id, username) values (p_community, v_uid, btrim(p_username));
  perform private.save_consents(p_community, v_uid, p_consents);
end
$$;

drop policy members_join on public.members;
revoke insert on public.members from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Identity check: an ID photo on the application (private bucket)

alter table public.photos drop constraint photos_purpose_check;
alter table public.photos add constraint photos_purpose_check
  check (purpose in ('profile', 'album', 'chat', 'ad', 'application', 'identity'));

alter table public.applications
  add column id_photo_id uuid,
  add column media_deleted_at timestamptz, -- the images were deleted after the decision ("Checked and deleted")
  add constraint applications_id_photo_fk foreign key (community_id, id_photo_id)
    references public.photos (community_id, id) on delete set null (id_photo_id);

-- A25: as before, plus the ID photo when the community requires the identity check.
-- p_application: {photo?, id_photo?, message?, real_name_1?, real_name_2?}.
create or replace function public.submit_application(p_community uuid, p_application jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
  v_community public.communities;
  v_photo uuid;
  v_id_photo uuid;
  v_id uuid;
begin
  if v_member.state <> 'profile' then
    raise exception 'you have applied already' using errcode = '23505';
  end if;
  if jsonb_typeof(p_application) is distinct from 'object' then
    raise exception 'application must be an object' using errcode = '22023';
  end if;
  select * into v_community from public.communities where id = p_community;
  if (v_community.require_app_image and jsonb_typeof(p_application -> 'photo') is distinct from 'object')
    or (v_community.require_identity and jsonb_typeof(p_application -> 'id_photo') is distinct from 'object')
    or (v_community.require_app_text and private.text_of(p_application, 'message') is null)
    or (v_community.require_app_names and private.text_of(p_application, 'real_name_1') is null) then
    raise exception 'the application misses something the community asks for' using errcode = '23502';
  end if;
  if not private.required_filled(p_community, v_member.user_id) then
    raise exception 'fill in the required fields of your profile first' using errcode = '23514';
  end if;

  if jsonb_typeof(p_application -> 'photo') = 'object' then
    v_photo := private.insert_photo(p_community, p_application -> 'photo', 'private', 'application');
  end if;
  if jsonb_typeof(p_application -> 'id_photo') = 'object' then
    v_id_photo := private.insert_photo(p_community, p_application -> 'id_photo', 'private', 'identity');
  end if;

  insert into public.applications (community_id, user_id, photo_id, id_photo_id, message, real_name_1, real_name_2)
  values (
    p_community, v_member.user_id, v_photo, v_id_photo,
    private.text_of(p_application, 'message'),
    private.text_of(p_application, 'real_name_1'),
    private.text_of(p_application, 'real_name_2')
  )
  returning id into v_id;

  update public.members set state = 'applied' where community_id = p_community and user_id = v_member.user_id;
  return v_id;
end
$$;

-- The decided application's images: their rows go now (the application keeps media_deleted_at);
-- the returned paths (image and thumbnail, private bucket) are deleted from Storage by the server.
create function private.drop_application_media(p_application uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_paths text[];
begin
  with gone as (
    delete from public.photos p
    using public.applications a
    where a.id = p_application and p.id in (a.photo_id, a.id_photo_id)
    returning p.path, p.thumb_path
  )
  select coalesce(array_agg(x.path), '{}') into v_paths
  from gone cross join lateral (values (gone.path), (gone.thumb_path)) as x (path);

  update public.applications set media_deleted_at = now() where id = p_application and media_deleted_at is null;
  return v_paths;
end
$$;

-- A20/A21: as before; approving or rejecting also deletes the images (D31). Returns what the
-- approval email needs and `files`, the Storage paths to delete.
create or replace function public.decide_application(p_application uuid, p_decision text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications;
  v_email text;
  v_files text[] := '{}';
begin
  if p_decision is null or p_decision not in ('approved', 'later', 'rejected') then
    raise exception 'unknown decision' using errcode = '22023';
  end if;
  select * into v_app from public.applications where id = p_application for update;
  if not found or not (select private.is_community_admin(v_app.community_id)) then
    raise exception 'only the community admin decides applications' using errcode = '42501';
  end if;
  if v_app.chat_id is not null then
    raise exception 'group applications are decided by the group admin' using errcode = '42501';
  end if;
  if v_app.status not in ('pending', 'later') then
    raise exception 'this application is decided already' using errcode = '23514';
  end if;

  update public.applications
  set status = p_decision,
      decided_by = case when p_decision = 'later' then null else (select auth.uid()) end,
      decided_at = case when p_decision = 'later' then null else now() end
  where id = p_application;

  if p_decision = 'approved' then
    update public.members set state = 'approved'
    where community_id = v_app.community_id and user_id = v_app.user_id and state in ('profile', 'applied');
    insert into public.admin_records (scope_id, community_id, user_id, real_name_1, real_name_2)
    values (v_app.community_id, v_app.community_id, v_app.user_id, v_app.real_name_1, v_app.real_name_2)
    on conflict (scope_id, user_id) do update
    set real_name_1 = coalesce(public.admin_records.real_name_1, excluded.real_name_1),
        real_name_2 = coalesce(public.admin_records.real_name_2, excluded.real_name_2),
        updated_at = now();
    select u.email into v_email from auth.users u where u.id = v_app.user_id;
  elsif p_decision = 'rejected' then
    update public.members set state = 'rejected'
    where community_id = v_app.community_id and user_id = v_app.user_id and state in ('profile', 'applied');
  end if;
  if p_decision in ('approved', 'rejected') then
    v_files := private.drop_application_media(p_application);
  end if;

  return jsonb_build_object(
    'user_id', v_app.user_id,
    'email', v_email,
    'username', (select username from public.members where community_id = v_app.community_id and user_id = v_app.user_id),
    'files', to_jsonb(v_files)
  );
end
$$;

-- A31: as before; an open application goes with them, images included. Returns {files}.
drop function public.remove_member(uuid, uuid);
create function public.remove_member(p_community uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_app uuid;
  v_files text[] := '{}';
begin
  perform private.require_community_admin(p_community);
  if p_user = (select auth.uid()) then
    raise exception 'you cannot remove yourself' using errcode = '42501';
  end if;
  update public.members set state = 'removed'
  where community_id = p_community and user_id = p_user and not is_system and state <> 'removed';
  if not found then
    raise exception 'no such member' using errcode = '22023';
  end if;
  for v_app in
    update public.applications set status = 'rejected', decided_by = (select auth.uid()), decided_at = now()
    where community_id = p_community and user_id = p_user and status in ('pending', 'later')
    returning id
  loop
    v_files := v_files || private.drop_application_media(v_app);
  end loop;
  return jsonb_build_object('files', to_jsonb(v_files));
end
$$;

-- A21: as before, plus the ID photo, and when (and by whom) the images were checked and deleted.
create or replace function public.admin_member(p_community uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  perform private.require_community_admin(p_community);
  select jsonb_build_object(
    'user_id', m.user_id,
    'state', m.state,
    'application', (
      select jsonb_build_object(
        'id', a.id, 'status', a.status, 'message', a.message, 'real_name_1', a.real_name_1, 'real_name_2', a.real_name_2,
        'created_at', a.created_at, 'photo', private.photo_json(p), 'id_photo', private.photo_json(ip),
        'media_deleted_at', a.media_deleted_at,
        'decided_by', (select d.username from public.members d where d.community_id = a.community_id and d.user_id = a.decided_by)
      )
      from public.applications a
      left join public.photos p on p.id = a.photo_id
      left join public.photos ip on ip.id = a.id_photo_id
      where a.community_id = p_community and a.user_id = p_user and a.chat_id is null
      order by a.created_at desc
      limit 1
    ),
    'record', (
      select jsonb_build_object(
        'real_name_1', r.real_name_1, 'real_name_2', r.real_name_2,
        'state_1', r.state_1, 'state_2', r.state_2, 'state_3', r.state_3, 'notes', r.notes
      )
      from public.admin_records r
      where r.scope_id = p_community and r.user_id = p_user
    )
  ) into v_result
  from public.members m
  where m.community_id = p_community and m.user_id = p_user and not m.is_system and m.state <> 'removed';
  return v_result;
end
$$;

-- A25: your own latest community application, with the ID photo you sent (until it is deleted).
create or replace function public.my_application(p_community uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', a.status, 'message', a.message, 'real_name_1', a.real_name_1, 'real_name_2', a.real_name_2,
    'created_at', a.created_at, 'photo', private.photo_json(p), 'id_photo', private.photo_json(ip)
  )
  from public.applications a
  left join public.photos p on p.id = a.photo_id
  left join public.photos ip on ip.id = a.id_photo_id
  where a.community_id = p_community and a.user_id = (select auth.uid()) and a.chat_id is null
  order by a.created_at desc
  limit 1
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.save_consents(uuid, uuid, jsonb), private.drop_application_media(uuid) from public, anon, authenticated;

revoke execute on function public.join_community(uuid, text, jsonb), public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.join_community(uuid, text, jsonb), public.remove_member(uuid, uuid) to authenticated;
