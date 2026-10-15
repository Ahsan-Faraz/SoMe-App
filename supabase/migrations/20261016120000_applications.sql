-- Step 4: community application and approval (docs/backend-design.md §4.4, §5, §6.2, §9).
-- An applicant (state 'profile') fills in their profile, then applies once (A25): the application
-- image, message and real names the community asks for. The community admin reads the queue (A20),
-- opens the applicant (A21) and approves: the member gets full access, the real names are copied to
-- the admin's records, and an approval email is sent (by the server, after the response).
-- Admin records (real names, 3 numbered "profile states", notes) are the admin's private data on a
-- member, kept per scope: the community now, each group in step 7. Real names never live on members,
-- so a normal member can never read them, whatever they query.
-- Group applications (chat_id set) arrive with groups in step 7; until then chat_id is always null.

-- ---------------------------------------------------------------------------------------------
-- Private photos (application images now; chat images, albums and ads later): signed URLs only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private', 'private', false, 5242880, array['image/webp', 'image/jpeg']) -- MAX_IMAGE_BYTES
on conflict (id) do nothing;

-- Uploads go into your own folder of a community you belong to; never overwritten. Others read
-- these files only through URLs the server signs after checking who may see the row using them.
create policy private_photos_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'private'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}(_t)?\.(webp|jpg)$'
    and split_part(name, '/', 2) = (select auth.uid())::text
    and split_part(name, '/', 1) in (select community_id::text from private.member_communities() as c (community_id))
  );

create policy private_photos_own_read on storage.objects
  for select to authenticated
  using (bucket_id = 'private' and split_part(name, '/', 2) = (select auth.uid())::text);

create policy private_photos_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'private' and split_part(name, '/', 2) = (select auth.uid())::text);

-- A photo row for files the caller uploaded to their folder of a bucket (both the image and _t).
create function private.insert_photo(p_community uuid, p_photo jsonb, p_bucket text, p_purpose text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_path text := p_photo ->> 'path';
  v_thumb text := regexp_replace(v_path, '\.(webp|jpg)$', '_t.\1');
  v_taken boolean := coalesce((p_photo ->> 'taken_in_app')::boolean, false);
  v_id uuid;
begin
  if jsonb_typeof(p_photo) is distinct from 'object'
    or v_path is null
    or v_path !~ ('^' || p_community || '/' || v_uid || '/[0-9a-f-]{36}\.(webp|jpg)$')
    or p_photo ->> 'thumb_path' is distinct from v_thumb then
    raise exception 'photo path must be in your own folder' using errcode = '22023';
  end if;
  if (select count(*) from storage.objects where bucket_id = p_bucket and name in (v_path, v_thumb)) <> 2 then
    raise exception 'upload the photo and its thumbnail first' using errcode = '22023';
  end if;

  insert into public.photos (community_id, owner_id, bucket, path, thumb_path, width, height, taken_in_app, taken_at, purpose)
  values (
    p_community, v_uid, p_bucket, v_path, v_thumb,
    (p_photo ->> 'width')::integer, (p_photo ->> 'height')::integer,
    v_taken, case when v_taken then now() end, p_purpose
  )
  returning id into v_id;
  return v_id;
end
$$;

create or replace function private.insert_profile_photo(p_community uuid, p_photo jsonb) returns uuid
language sql security definer set search_path = '' as $$
  select private.insert_photo(p_community, p_photo, 'profile', 'profile')
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  user_id uuid not null,
  chat_id uuid, -- null = joining the community; a group's chat in step 7
  photo_id uuid, -- the application image (Taken in app when from the camera)
  message text check (char_length(message) between 1 and 4000),
  real_name_1 text check (char_length(real_name_1) between 1 and 80 and real_name_1 = btrim(real_name_1)),
  real_name_2 text check (char_length(real_name_2) between 1 and 80 and real_name_2 = btrim(real_name_2)),
  status text not null default 'pending' check (status in ('pending', 'later', 'approved', 'rejected')),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status in ('approved', 'rejected')) = (decided_at is not null)),
  foreign key (community_id, user_id) references public.members on delete cascade,
  foreign key (community_id, photo_id) references public.photos (community_id, id) on delete set null (photo_id)
);

-- One open application per target: "Apply" stays dimmed while it is open.
create unique index applications_open on public.applications (community_id, user_id, coalesce(chat_id, community_id))
  where status in ('pending', 'later');
-- The admin queue (A20): open community applications, oldest first.
create index applications_queue on public.applications (community_id, created_at) where chat_id is null and status in ('pending', 'later');
-- A21: an applicant's latest community application.
create index applications_member on public.applications (community_id, user_id, created_at desc);

create table public.admin_records (
  scope_id uuid not null, -- the community_id for the community level; a group's chat_id in step 7
  community_id uuid not null,
  user_id uuid not null,
  real_name_1 text check (char_length(real_name_1) between 1 and 80 and real_name_1 = btrim(real_name_1)),
  real_name_2 text check (char_length(real_name_2) between 1 and 80 and real_name_2 = btrim(real_name_2)),
  state_1 integer check (state_1 between -1000000000 and 1000000000), -- labels: communities.state_label_N
  state_2 integer check (state_2 between -1000000000 and 1000000000),
  state_3 integer check (state_3 between -1000000000 and 1000000000),
  notes text check (char_length(notes) between 1 and 4000),
  updated_at timestamptz not null default now(),
  primary key (scope_id, user_id),
  foreign key (community_id, user_id) references public.members on delete cascade
);

create index admin_records_member on public.admin_records (community_id, user_id);

-- ---------------------------------------------------------------------------------------------
-- Security. Applications: the applicant reads their own, the community admin reads the community's.
-- Admin records: the community admin only (Q6). Every write goes through the RPCs below.

alter table public.applications enable row level security;
alter table public.admin_records enable row level security;
revoke all on public.applications, public.admin_records from anon, authenticated;
grant select on public.applications, public.admin_records to authenticated;

create policy applications_read on public.applications
  for select to authenticated
  using (user_id = (select auth.uid()) or community_id in (select private.admin_communities()));

create policy admin_records_read on public.admin_records
  for select to authenticated
  using (scope_id = community_id and community_id in (select private.admin_communities()));

-- ---------------------------------------------------------------------------------------------
-- Helpers

-- Is every required field of this profile filled (for every person it applies to)? No Status = no.
create function private.required_filled(p_community uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select m.status_id is not null and not exists (
    select 1
    from public.profile_fields f
    cross join lateral (
      select null::uuid as substatus_id, 0::smallint as n
      union
      select substatus_id, n from private.status_people(m.status_id) where n > 0
    ) as p
    where f.community_id = p_community and f.required
      and private.field_applies(f, m.status_id, p.substatus_id, p.n)
      and not exists (select 1 from public.profile_values v where v.field_id = f.id and v.user_id = p_user and v.substatus_id is not distinct from p.substatus_id and v.n = p.n)
      and not exists (select 1 from public.profile_value_options v where v.field_id = f.id and v.user_id = p_user and v.substatus_id is not distinct from p.substatus_id and v.n = p.n)
  )
  from public.members m
  where m.community_id = p_community and m.user_id = p_user
$$;

-- The score rule (D21, Q2), now using required_filled for its last part. Unchanged otherwise.
create or replace function private.compute_score(p_community uuid, p_user uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  select least(100,
    least(40, 10 * (
      select count(distinct v.field_id)
      from public.profile_values v
      join public.profile_fields f on f.id = v.field_id
      where v.community_id = p_community and v.user_id = p_user and f.kind = 'long_text'
        and char_length(v.value_text) >= 200 and private.field_applies(f, m.status_id, v.substatus_id, v.n)
    ))
    + case when m.photo_id is not null then 10 else 0 end
    + case when exists (select 1 from public.photos p where p.id = m.photo_id and p.taken_in_app) then 30 else 0 end
    + case when private.required_filled(p_community, p_user) then 20 else 0 end
  )::smallint
  from public.members m
  where m.community_id = p_community and m.user_id = p_user
$$;

-- An optional text from a JSON object: trimmed, null when empty.
create function private.text_of(p_object jsonb, p_key text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(p_object ->> p_key), '')
$$;

-- ---------------------------------------------------------------------------------------------
-- Applicant

-- A25: apply to the community, once. p_application: {photo?: {path, thumb_path, width, height,
-- taken_in_app}, message?, real_name_1?, real_name_2?}. What the community requires must be there,
-- and the profile's required fields must be filled. The member becomes 'applied'.
create function public.submit_application(p_community uuid, p_application jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
  v_community public.communities;
  v_photo uuid;
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

  insert into public.applications (community_id, user_id, photo_id, message, real_name_1, real_name_2)
  values (
    p_community, v_member.user_id, v_photo,
    private.text_of(p_application, 'message'),
    private.text_of(p_application, 'real_name_1'),
    private.text_of(p_application, 'real_name_2')
  )
  returning id into v_id;

  update public.members set state = 'applied' where community_id = p_community and user_id = v_member.user_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Community admin

-- An admin check usable inside a query: true for the community admin, an error for anyone else.
-- A row can only come back after it passed, so it never leaks rows whatever the plan.
create function private.assert_community_admin(p_community uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_community_admin(p_community);
  return true;
end
$$;

-- A20/A31: the community's open applications (p_applications) or its members, with this scope's
-- admin record. Real names: the record's, else the application's. Members are sorted by name,
-- applications oldest first. Plain SQL (not PL/pgSQL), so 2,000 rows come back in about 12 ms.
-- perf: the whole community in one call, up to 2,000 (the door list filters on the phone); page it
-- in step 11 if communities grow past that.
create function public.admin_roster(p_community uuid, p_applications boolean)
returns table (
  user_id uuid, username text, status_id uuid, application_id uuid, message text,
  real_name_1 text, real_name_2 text, state_1 integer, state_2 integer, state_3 integer, notes text
)
language sql stable security definer set search_path = '' as $$
  (select m.user_id, m.username, m.status_id, a.id, a.message,
     coalesce(r.real_name_1, a.real_name_1), coalesce(r.real_name_2, a.real_name_2), r.state_1, r.state_2, r.state_3, r.notes
   from public.applications a
   join public.members m on m.community_id = a.community_id and m.user_id = a.user_id
   left join public.admin_records r on r.scope_id = a.community_id and r.user_id = a.user_id
   where p_applications and private.assert_community_admin(p_community)
     and a.community_id = p_community and a.chat_id is null and a.status in ('pending', 'later')
   order by a.created_at
   limit 2000)
  union all
  (select m.user_id, m.username, m.status_id, null::uuid, null::text,
     r.real_name_1, r.real_name_2, r.state_1, r.state_2, r.state_3, r.notes
   from public.members m
   left join public.admin_records r on r.scope_id = m.community_id and r.user_id = m.user_id
   where not p_applications and private.assert_community_admin(p_community)
     and m.community_id = p_community and m.state = 'approved' and not m.is_system
   order by lower(m.username)
   limit 2000)
$$;

-- A21: one member's admin view: their latest community application (open or decided) and this
-- scope's record. Null when the member is not in this community. The image's path is returned for
-- the server to sign (private bucket).
create function public.admin_member(p_community uuid, p_user uuid) returns jsonb
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
        'created_at', a.created_at, 'photo', private.photo_json(p)
      )
      from public.applications a
      left join public.photos p on p.id = a.photo_id
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

-- A20/A21: decide a community application: 'approved' (the UI's Approve), 'later' or 'rejected'
-- (Q5: the database supports all three). Approving gives full access and copies the real names into
-- the community record (names already there are kept). Returns what the approval email needs.
create function public.decide_application(p_application uuid, p_decision text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications;
  v_email text;
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

  return jsonb_build_object(
    'user_id', v_app.user_id,
    'email', v_email,
    'username', (select username from public.members where community_id = v_app.community_id and user_id = v_app.user_id)
  );
end
$$;

-- A21/A31: change a member's community record. p_record: any of {real_name_1, real_name_2,
-- state_1, state_2, state_3, notes}; keys left out stay as they are, an empty value clears it.
create function public.save_admin_record(p_community uuid, p_user uuid, p_record jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_community_admin(p_community);
  if jsonb_typeof(p_record) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(p_record) as k (key)
    where k.key not in ('real_name_1', 'real_name_2', 'state_1', 'state_2', 'state_3', 'notes')
  ) then
    raise exception 'unknown record field' using errcode = '22023';
  end if;
  if not exists (select 1 from public.members where community_id = p_community and user_id = p_user and not is_system and state <> 'removed') then
    raise exception 'no such member' using errcode = '22023';
  end if;

  insert into public.admin_records (scope_id, community_id, user_id)
  values (p_community, p_community, p_user)
  on conflict (scope_id, user_id) do nothing;

  update public.admin_records
  set real_name_1 = case when p_record ? 'real_name_1' then private.text_of(p_record, 'real_name_1') else real_name_1 end,
      real_name_2 = case when p_record ? 'real_name_2' then private.text_of(p_record, 'real_name_2') else real_name_2 end,
      state_1 = case when p_record ? 'state_1' then (private.text_of(p_record, 'state_1'))::integer else state_1 end,
      state_2 = case when p_record ? 'state_2' then (private.text_of(p_record, 'state_2'))::integer else state_2 end,
      state_3 = case when p_record ? 'state_3' then (private.text_of(p_record, 'state_3'))::integer else state_3 end,
      notes = case when p_record ? 'notes' then private.text_of(p_record, 'notes') else notes end,
      updated_at = now()
  where scope_id = p_community and user_id = p_user;
end
$$;

-- A31: remove a member from the community. They lose access at once; their data stays (account
-- deletion is step 15). Not yourself, not the No-reply account.
create function public.remove_member(p_community uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
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
  -- An open application goes with them.
  update public.applications set status = 'rejected', decided_by = (select auth.uid()), decided_at = now()
  where community_id = p_community and user_id = p_user and status in ('pending', 'later');
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.insert_photo(uuid, jsonb, text, text), private.required_filled(uuid, uuid),
  private.text_of(jsonb, text), private.assert_community_admin(uuid) from public;

revoke execute on function public.submit_application(uuid, jsonb), public.admin_roster(uuid, boolean), public.admin_member(uuid, uuid),
  public.decide_application(uuid, text), public.save_admin_record(uuid, uuid, jsonb), public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.submit_application(uuid, jsonb), public.admin_roster(uuid, boolean), public.admin_member(uuid, uuid),
  public.decide_application(uuid, text), public.save_admin_record(uuid, uuid, jsonb), public.remove_member(uuid, uuid) to authenticated;
