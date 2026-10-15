-- Step 3: profiles (docs/backend-design.md §4.4–§4.6, §5, §6.5, §7).
-- Built-in profile columns on members, the answers to the builder's fields, profile photos (public
-- `profile` bucket) and linked profiles. Clients never write these tables directly: every write goes
-- through a security definer RPC below that checks who is calling and validates each answer against
-- its field. Reads go through `profile()` (one call per profile) and `profile_cards()` (the list).

-- ---------------------------------------------------------------------------------------------
-- Photos. One row per image wherever it is used; step 3 only uses purpose 'profile'.

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  owner_id uuid not null,
  bucket text not null check (bucket in ('profile', 'private')),
  path text not null unique, -- {community}/{owner}/{uuid}.webp; never reused (replace = new path)
  thumb_path text not null unique, -- the same with _t, about 256 px
  width integer check (width between 1 and 10000),
  height integer check (height between 1 and 10000),
  taken_in_app boolean not null default false, -- D16: in-app camera. A claim, not proof.
  taken_at timestamptz, -- when a Taken in app photo was taken
  purpose text not null check (purpose in ('profile', 'album', 'chat', 'ad', 'application')),
  created_at timestamptz not null default now(),
  check (taken_in_app = (taken_at is not null)),
  unique (community_id, id),
  foreign key (community_id, owner_id) references public.members on delete cascade
);

create index photos_owner on public.photos (community_id, owner_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Built-in profile fields on members (D2, D5, D7, D8, D21, D22). Indexed columns, so search is fast.

alter table public.members
  add column status_id uuid,
  add column looking_for uuid[] not null default '{}' check (cardinality(looking_for) <= 50),
  add column district_id uuid,
  add column place text check (char_length(place) between 1 and 80 and place = btrim(place)),
  add column birth_date date check (birth_date >= '1900-01-01'),
  add column birth_date_2 date check (birth_date_2 >= '1900-01-01'), -- the second person of a couple
  add column visible_in_search boolean not null default true,
  add column score smallint not null default 0 check (score between 0 and 100),
  add column icon_photo_id uuid,
  add column main_photo_ids uuid[] not null default '{}' check (cardinality(main_photo_ids) <= 3),
  -- Same community as the member, whatever the caller sends.
  add constraint members_status_fk foreign key (community_id, status_id) references public.community_options (community_id, id),
  add constraint members_district_fk foreign key (community_id, district_id) references public.community_options (community_id, id),
  add constraint members_icon_fk foreign key (community_id, icon_photo_id)
    references public.photos (community_id, id) on delete set null (icon_photo_id);

-- The Profiles list (A5) pages by score: profile_cards() below, search_profiles() in step 9.
create index members_score on public.members (community_id, score desc, user_id desc) where state = 'approved';
-- A32 "search" for a profile to link: a name contains the typed text.
create index members_username_trgm on public.members using gin (lower(username) extensions.gin_trgm_ops);

-- Birth dates are shown as ages to others; only profile() reads them. Every other column stays
-- readable under members_read (step 1).
revoke select on public.members from authenticated;
grant select (
  community_id, user_id, username, role, can_create_groups, state, is_system, locale, last_login_at, created_at,
  status_id, looking_for, district_id, place, visible_in_search, score, icon_photo_id, main_photo_ids
) on public.members to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Answers (§4.5). One row per answer in a column of the right type; pick answers in their own table.

-- Target of profile_value_options' (field_id, option_id) key: a choice of that same field.
alter table public.profile_field_options add constraint profile_field_options_field_id_uq unique (field_id, id);

create table public.profile_values (
  community_id uuid not null,
  user_id uuid not null,
  field_id uuid not null,
  person smallint not null default 1 check (person in (1, 2)), -- 2 = the second person of a couple
  value_text text check (char_length(value_text) between 1 and 32000),
  value_num numeric check (value_num between -1e15 and 1e15),
  value_bool boolean,
  value_date date check (value_date between '1000-01-01' and '9999-12-31'),
  value_photo_id uuid,
  primary key (field_id, user_id, person),
  check (num_nonnulls(value_text, value_num, value_bool, value_date, value_photo_id) = 1),
  foreign key (community_id, user_id) references public.members on delete cascade,
  foreign key (community_id, field_id) references public.profile_fields (community_id, id),
  foreign key (community_id, value_photo_id) references public.photos (community_id, id) on delete cascade
);

create index profile_values_member on public.profile_values (community_id, user_id);

create table public.profile_value_options (
  community_id uuid not null,
  user_id uuid not null,
  field_id uuid not null,
  person smallint not null default 1 check (person in (1, 2)),
  option_id uuid not null,
  primary key (field_id, user_id, person, option_id),
  foreign key (community_id, user_id) references public.members on delete cascade,
  foreign key (community_id, field_id) references public.profile_fields (community_id, id),
  foreign key (field_id, option_id) references public.profile_field_options (field_id, id)
);

create index profile_value_options_member on public.profile_value_options (community_id, user_id);

-- ---------------------------------------------------------------------------------------------
-- Linked profiles (A32, D23): up to 3 per member. A link is confirmed when the other person links
-- back (the reverse row exists). Others only ever see confirmed pairs.

create table public.profile_links (
  community_id uuid not null,
  user_id uuid not null,
  linked_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (community_id, user_id, linked_user_id),
  check (user_id <> linked_user_id),
  foreign key (community_id, user_id) references public.members on delete cascade,
  foreign key (community_id, linked_user_id) references public.members on delete cascade
);

-- "Who linked to you", and the cascade from the linked member.
create index profile_links_linked on public.profile_links (community_id, linked_user_id);

-- ---------------------------------------------------------------------------------------------
-- Security. No client reads or writes these tables directly: the RPCs below are the only way in.

alter table public.photos enable row level security;
alter table public.profile_values enable row level security;
alter table public.profile_value_options enable row level security;
alter table public.profile_links enable row level security;
revoke all on public.photos, public.profile_values, public.profile_value_options, public.profile_links from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage: the public `profile` bucket (icon, 3 main photos, photo answers). Unguessable, immutable
-- paths {community}/{owner}/{uuid}.webp and _t.webp, cached for a year by the browser.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile', 'profile', true, 5242880, array['image/webp', 'image/jpeg']) -- MAX_IMAGE_BYTES
on conflict (id) do nothing;

-- A member uploads into their own folder of a community they belong to. No update policy: a file
-- is never overwritten. Read is public through the bucket; select and delete are for cleaning up.
create policy profile_photos_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}(_t)?\.(webp|jpg)$'
    and split_part(name, '/', 2) = (select auth.uid())::text
    and split_part(name, '/', 1) in (select community_id::text from private.member_communities() as c (community_id))
  );

create policy profile_photos_own_read on storage.objects
  for select to authenticated
  using (bucket_id = 'profile' and split_part(name, '/', 2) = (select auth.uid())::text);

create policy profile_photos_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile' and split_part(name, '/', 2) = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------------------
-- Helpers

-- The caller's own account here, locked so two saves of one profile run one after the other.
-- Applicants included: they fill in their profile before they apply.
create function private.own_member_for_update(p_community uuid) returns public.members
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members;
begin
  select * into v_member from public.members
  where community_id = p_community and user_id = (select auth.uid())
    and state in ('profile', 'applied', 'approved') and not is_system
  for update;
  if not found then
    raise exception 'no account in this community' using errcode = '42501';
  end if;
  return v_member;
end
$$;

-- Does this field belong on a profile with this Status, for this person? (D4, Q3)
create function private.field_applies(p_field public.profile_fields, p_status uuid, p_people smallint, p_person smallint)
returns boolean
language sql immutable set search_path = '' as $$
  select p_field.active
    and p_status is not null
    and (p_field.for_statuses is null or p_status = any (p_field.for_statuses))
    and (p_person = 1 or (p_person = 2 and p_field.per_person and p_people = 2))
$$;

-- Profile score (D21, Q2 default rule), capped at 100. Stored on members and recomputed on every
-- save, never on read, so "Profile score min" is a plain indexed filter. Change the rule here only.
--   +10 per long text field answered with at least 200 characters (max +40)
--   +10 for a main photo, +30 more if it is Taken in app
--   +20 when every required field is filled (both people of a couple for per-person fields)
create function private.compute_score(p_community uuid, p_user uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  with m as (
    select m.status_id, m.main_photo_ids, coalesce(o.people, 1)::smallint as people
    from public.members m
    left join public.community_options o on o.id = m.status_id
    where m.community_id = p_community and m.user_id = p_user
  ),
  slots as ( -- every (field, person) this profile has
    select f.id, f.kind, f.required, p.person
    from m
    cross join public.profile_fields f
    cross join (values (1::smallint), (2::smallint)) as p (person)
    where f.community_id = p_community and private.field_applies(f, m.status_id, m.people, p.person)
  )
  select least(100,
    least(40, 10 * (
      select count(distinct v.field_id) from public.profile_values v join slots s on s.id = v.field_id and s.person = v.person
      where v.user_id = p_user and s.kind = 'long_text' and char_length(v.value_text) >= 200
    ))
    + case when cardinality(m.main_photo_ids) > 0 then 10 else 0 end
    + case when exists (select 1 from public.photos p where p.id = m.main_photo_ids[1] and p.taken_in_app) then 30 else 0 end
    + case when m.status_id is not null and not exists (
        select 1 from slots s
        where s.required
          and not exists (select 1 from public.profile_values v where v.field_id = s.id and v.user_id = p_user and v.person = s.person)
          and not exists (select 1 from public.profile_value_options v where v.field_id = s.id and v.user_id = p_user and v.person = s.person)
      ) then 20 else 0 end
  )::smallint
  from m
$$;

-- Deletes the caller's profile photos that nothing uses any more and recomputes the score.
-- Returns the files to delete from Storage (the caller removes them after responding).
create function private.finish_profile_save(p_community uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_score smallint := private.compute_score(p_community, p_user);
  v_removed text[];
begin
  update public.members set score = v_score where community_id = p_community and user_id = p_user and score <> v_score;

  with gone as (
    delete from public.photos p
    using public.members m
    where m.community_id = p_community and m.user_id = p_user
      and p.community_id = p_community and p.owner_id = p_user and p.purpose = 'profile'
      and p.id is distinct from m.icon_photo_id
      and not p.id = any (m.main_photo_ids)
      and not exists (select 1 from public.profile_values v where v.value_photo_id = p.id)
    returning p.path, p.thumb_path
  )
  select coalesce(array_agg(f.path), '{}') into v_removed
  from gone cross join lateral (values (gone.path), (gone.thumb_path)) as f (path);

  return jsonb_build_object('score', v_score, 'removed', to_jsonb(v_removed));
end
$$;

-- A photo row for files the caller has uploaded to their folder in the profile bucket.
create function private.insert_profile_photo(p_community uuid, p_photo jsonb) returns uuid
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
  if (select count(*) from storage.objects where bucket_id = 'profile' and name in (v_path, v_thumb)) <> 2 then
    raise exception 'upload the photo and its thumbnail first' using errcode = '22023';
  end if;

  insert into public.photos (community_id, owner_id, bucket, path, thumb_path, width, height, taken_in_app, taken_at, purpose)
  values (
    p_community, v_uid, 'profile', v_path, v_thumb,
    (p_photo ->> 'width')::integer, (p_photo ->> 'height')::integer,
    v_taken, case when v_taken then now() end, 'profile'
  )
  returning id into v_id;
  return v_id;
end
$$;

-- One photo as the profile screens show it.
create function private.photo_json(p public.photos) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p.id is not null then jsonb_build_object(
    'id', p.id, 'path', p.path, 'thumb_path', p.thumb_path, 'width', p.width, 'height', p.height,
    'taken_in_app', p.taken_in_app, 'taken_at', p.taken_at, 'created_at', p.created_at
  ) end
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads

-- A3/B1: one profile in one call (§6.5): the built-ins, the answers to the fields its Status has,
-- photos and linked profiles. The field definitions themselves come from the cached builder.
-- Null when the caller may not see it: applicants see only themselves; approved members see
-- approved members; the community admin sees everyone here (applicants too). Blocks: step 6.
-- Birth dates only on your own profile; everyone sees ages.
create function public.profile(p_community uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_viewer public.members;
  v_member public.members;
  v_own boolean := p_user = v_uid;
  v_people smallint;
begin
  select * into v_viewer from public.members
  where community_id = p_community and user_id = v_uid and state in ('profile', 'applied', 'approved');
  if not found then
    return null;
  end if;

  select * into v_member from public.members
  where community_id = p_community and user_id = p_user and not is_system;
  if not found or not (
    v_own
    or (v_viewer.state = 'approved' and v_viewer.role = 'admin')
    or (v_viewer.state = 'approved' and v_member.state = 'approved')
  ) then
    return null;
  end if;

  v_people := coalesce((select people from public.community_options where id = v_member.status_id), 1::smallint);

  return jsonb_build_object(
    'user_id', v_member.user_id,
    'username', v_member.username,
    'state', v_member.state,
    'own', v_own,
    'status_id', v_member.status_id,
    'people', v_people,
    'looking_for', to_jsonb(v_member.looking_for),
    'district_id', v_member.district_id,
    'place', v_member.place,
    'birth_date', case when v_own then v_member.birth_date end,
    'birth_date_2', case when v_own and v_people = 2 then v_member.birth_date_2 end,
    'ages', to_jsonb(array_remove(array[
      extract(year from age(current_date, v_member.birth_date))::integer,
      case when v_people = 2 then extract(year from age(current_date, v_member.birth_date_2))::integer end
    ], null)),
    'visible_in_search', v_member.visible_in_search,
    'score', v_member.score,
    'last_login_at', v_member.last_login_at,
    'icon', (select private.photo_json(p) from public.photos p where p.id = v_member.icon_photo_id),
    'main', coalesce((
      select jsonb_agg(private.photo_json(p) order by i.n)
      from unnest(v_member.main_photo_ids) with ordinality as i (id, n)
      join public.photos p on p.id = i.id
    ), '[]'),
    'values', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', v.field_id, 'person', v.person, 'text', v.value_text, 'num', v.value_num,
        'bool', v.value_bool, 'date', v.value_date, 'photo', private.photo_json(p)
      ))
      from public.profile_values v
      join public.profile_fields f on f.id = v.field_id
      left join public.photos p on p.id = v.value_photo_id
      where v.community_id = p_community and v.user_id = p_user
        and private.field_applies(f, v_member.status_id, v_people, v.person)
    ), '[]'),
    'choices', coalesce((
      select jsonb_agg(jsonb_build_object('field_id', c.field_id, 'person', c.person, 'option_ids', c.option_ids))
      from (
        select v.field_id, v.person, array_agg(v.option_id order by o.position) as option_ids
        from public.profile_value_options v
        join public.profile_fields f on f.id = v.field_id
        join public.profile_field_options o on o.id = v.option_id
        where v.community_id = p_community and v.user_id = p_user
          and private.field_applies(f, v_member.status_id, v_people, v.person)
        group by v.field_id, v.person
      ) as c
    ), '[]'),
    -- Your own: every link you made, confirmed or not. Someone else's: confirmed links only.
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'username', m.username, 'icon', p.thumb_path, 'confirmed', back.user_id is not null
      ) order by l.created_at)
      from public.profile_links l
      join public.members m on m.community_id = l.community_id and m.user_id = l.linked_user_id and m.state = 'approved'
      left join public.photos p on p.id = m.icon_photo_id
      left join public.profile_links back
        on back.community_id = l.community_id and back.user_id = l.linked_user_id and back.linked_user_id = l.user_id
      where l.community_id = p_community and l.user_id = p_user and (v_own or back.user_id is not null)
    ), '[]'),
    -- Your own only: who has linked to you, so you can link back.
    'linked_you', case when v_own then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', m.username, 'icon', p.thumb_path) order by l.created_at)
      from public.profile_links l
      join public.members m on m.community_id = l.community_id and m.user_id = l.user_id and m.state = 'approved'
      left join public.photos p on p.id = m.icon_photo_id
      where l.community_id = p_community and l.linked_user_id = p_user
    ), '[]') else '[]'::jsonb end
  );
end
$$;

-- A5 cards: approved members visible in search, best score first, keyset paged on (score, user_id).
-- Filters arrive with search_profiles() in step 9. Approved callers only.
create function public.profile_cards(p_community uuid, p_limit integer default 30, p_after_score smallint default null, p_after_user uuid default null)
returns table (
  user_id uuid, username text, status_id uuid, district_id uuid, place text, ages integer[], score smallint,
  looking_for uuid[], photo_thumb text, photo_taken_in_app boolean
)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.username, m.status_id, m.district_id, m.place,
    array_remove(array[
      extract(year from age(current_date, m.birth_date))::integer,
      case when o.people = 2 then extract(year from age(current_date, m.birth_date_2))::integer end
    ], null),
    m.score, m.looking_for, p.thumb_path, p.taken_in_app
  from public.members m
  left join public.community_options o on o.id = m.status_id
  left join public.photos p on p.id = m.main_photo_ids[1]
  where (select private.is_approved(p_community))
    and m.community_id = p_community and m.state = 'approved' and not m.is_system and m.visible_in_search
    and (p_after_score is null or (m.score, m.user_id) < (p_after_score, p_after_user))
  order by m.score desc, m.user_id desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- A32: approved members whose name contains the text, to link to. Approved callers only.
create function public.member_names(p_community uuid, p_query text, p_limit integer default 20)
returns table (user_id uuid, username text, icon text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.username, p.thumb_path
  from public.members m
  left join public.photos p on p.id = m.icon_photo_id
  where (select private.is_approved(p_community))
    and m.community_id = p_community and m.state = 'approved' and not m.is_system
    and m.user_id <> (select auth.uid())
    and lower(m.username) like '%' || replace(replace(replace(lower(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by lower(m.username)
  limit least(greatest(p_limit, 1), 50)
$$;

-- ---------------------------------------------------------------------------------------------
-- Writes (own profile)

-- B: save your own profile in one transaction, then recompute the score.
-- p_profile: any of {status_id, looking_for, district_id, place, birth_date, birth_date_2,
--   visible_in_search}; keys left out stay as they are. Status is set once (D4): changing it later
--   is the community admin's (set_member_status). Retired choices stay valid where already chosen.
-- p_values: [{field_id, person, value}] for fields of the profile's Status. value: string (text,
--   date, pick one), number, boolean, string[] (pick several), photo id (photo); null clears it.
--   Fields left out keep their answers. Returns {score, removed: [files to delete]}.
create function public.save_profile(p_community uuid, p_profile jsonb, p_values jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
  v_status uuid := v_member.status_id;
  v_people smallint;
  v_item jsonb;
  v_value jsonb;
  v_field public.profile_fields;
  v_person smallint;
  v_text text;
  v_previous uuid[];
  v_picked uuid[];
begin
  if jsonb_typeof(p_profile) is distinct from 'object' then
    raise exception 'profile must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_values) is distinct from 'array' or jsonb_array_length(p_values) > 1000 then
    raise exception 'values must be an array of at most 1000' using errcode = '22023';
  end if;

  -- Status (D4)
  if p_profile ? 'status_id' and (p_profile ->> 'status_id')::uuid is distinct from v_status then
    if v_status is not null then
      raise exception 'Status is set once; only the community admin can change it' using errcode = '42501';
    end if;
    v_status := (p_profile ->> 'status_id')::uuid;
    if not exists (
      select 1 from public.community_options
      where id = v_status and community_id = p_community and list = 'status' and active
    ) then
      raise exception 'unknown Status' using errcode = '22023';
    end if;
  end if;
  v_people := coalesce((select people from public.community_options where id = v_status), 1::smallint);

  -- Looking for (D5): Status choices of this community.
  if p_profile ? 'looking_for' then
    if jsonb_typeof(p_profile -> 'looking_for') is distinct from 'array' then
      raise exception 'looking_for must be an array' using errcode = '22023';
    end if;
    v_picked := array(select distinct x::uuid from jsonb_array_elements_text(p_profile -> 'looking_for') as x);
    if exists (
      select 1 from unnest(v_picked) as s (id)
      where not exists (
        select 1 from public.community_options o
        where o.id = s.id and o.community_id = p_community and o.list = 'status'
          and (o.active or s.id = any (v_member.looking_for))
      )
    ) then
      raise exception 'looking_for must be Status choices' using errcode = '22023';
    end if;
    v_member.looking_for := v_picked;
  end if;

  -- District (D8)
  if p_profile ? 'district_id' and (p_profile ->> 'district_id')::uuid is distinct from v_member.district_id then
    v_member.district_id := (p_profile ->> 'district_id')::uuid;
    if v_member.district_id is not null and not exists (
      select 1 from public.community_options
      where id = v_member.district_id and community_id = p_community and list = 'district' and active
    ) then
      raise exception 'unknown District' using errcode = '22023';
    end if;
  end if;

  if p_profile ? 'place' then
    v_member.place := nullif(btrim(p_profile ->> 'place'), '');
  end if;
  if p_profile ? 'birth_date' then
    v_member.birth_date := (p_profile ->> 'birth_date')::date;
  end if;
  if p_profile ? 'birth_date_2' then
    v_member.birth_date_2 := (p_profile ->> 'birth_date_2')::date;
  end if;
  if v_member.birth_date > current_date or v_member.birth_date_2 > current_date then
    raise exception 'a birth date cannot be in the future' using errcode = '22023';
  end if;
  if p_profile ? 'visible_in_search' then
    v_member.visible_in_search := coalesce((p_profile ->> 'visible_in_search')::boolean, true);
  end if;

  update public.members
  set status_id = v_status,
      looking_for = v_member.looking_for,
      district_id = v_member.district_id,
      place = v_member.place,
      birth_date = v_member.birth_date,
      birth_date_2 = case when v_people = 2 then v_member.birth_date_2 end,
      visible_in_search = v_member.visible_in_search
  where community_id = p_community and user_id = v_member.user_id;

  -- Answers: each checked against its field's type and choices.
  for v_item in select value from jsonb_array_elements(p_values) loop
    v_person := coalesce((v_item ->> 'person')::smallint, 1);
    select * into v_field from public.profile_fields
    where id = (v_item ->> 'field_id')::uuid and community_id = p_community;
    if not found or v_person not in (1, 2) or not private.field_applies(v_field, v_status, v_people, v_person) then
      raise exception 'field % is not on this profile', v_item ->> 'field_id' using errcode = '22023';
    end if;

    v_previous := array(
      select option_id from public.profile_value_options
      where field_id = v_field.id and user_id = v_member.user_id and person = v_person
    );
    delete from public.profile_values where field_id = v_field.id and user_id = v_member.user_id and person = v_person;
    delete from public.profile_value_options where field_id = v_field.id and user_id = v_member.user_id and person = v_person;

    v_value := v_item -> 'value';
    continue when v_value is null or jsonb_typeof(v_value) = 'null';

    case v_field.kind
    when 'short_text', 'long_text' then
      if jsonb_typeof(v_value) <> 'string' then
        raise exception '% takes text', v_field.key using errcode = '22023';
      end if;
      v_text := btrim(v_value #>> '{}');
      continue when v_text = '';
      if char_length(v_text) > coalesce(v_field.max_length, case v_field.kind when 'short_text' then 200 else 32000 end) then
        raise exception '% is too long', v_field.key using errcode = '22001';
      end if;
      insert into public.profile_values (community_id, user_id, field_id, person, value_text)
      values (p_community, v_member.user_id, v_field.id, v_person, v_text);

    when 'number' then
      if jsonb_typeof(v_value) <> 'number' then
        raise exception '% takes a number', v_field.key using errcode = '22023';
      end if;
      insert into public.profile_values (community_id, user_id, field_id, person, value_num)
      values (p_community, v_member.user_id, v_field.id, v_person, (v_value #>> '{}')::numeric);

    when 'yes_no' then
      if jsonb_typeof(v_value) <> 'boolean' then
        raise exception '% takes yes or no', v_field.key using errcode = '22023';
      end if;
      insert into public.profile_values (community_id, user_id, field_id, person, value_bool)
      values (p_community, v_member.user_id, v_field.id, v_person, (v_value #>> '{}')::boolean);

    when 'date' then
      if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception '% takes a date (YYYY-MM-DD)', v_field.key using errcode = '22023';
      end if;
      insert into public.profile_values (community_id, user_id, field_id, person, value_date)
      values (p_community, v_member.user_id, v_field.id, v_person, (v_value #>> '{}')::date);

    when 'pick_one', 'pick_several' then
      if v_field.kind = 'pick_one' and jsonb_typeof(v_value) = 'string' then
        v_picked := array[(v_value #>> '{}')::uuid];
      elsif v_field.kind = 'pick_several' and jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) <= 200 then
        v_picked := array(select distinct x::uuid from jsonb_array_elements_text(v_value) as x);
      else
        raise exception '% takes %', v_field.key, case v_field.kind when 'pick_one' then 'one choice' else 'a list of choices' end
          using errcode = '22023';
      end if;
      if exists (
        select 1 from unnest(v_picked) as s (id)
        where not exists (
          select 1 from public.profile_field_options o
          where o.id = s.id and o.field_id = v_field.id and (o.active or s.id = any (v_previous))
        )
      ) then
        raise exception '% has no such choice', v_field.key using errcode = '22023';
      end if;
      insert into public.profile_value_options (community_id, user_id, field_id, person, option_id)
      select p_community, v_member.user_id, v_field.id, v_person, s.id from unnest(v_picked) as s (id);

    when 'photo' then
      if jsonb_typeof(v_value) <> 'string' or not exists (
        select 1 from public.photos
        where id = (v_value #>> '{}')::uuid and community_id = p_community
          and owner_id = v_member.user_id and purpose = 'profile'
      ) then
        raise exception '% takes one of your profile photos', v_field.key using errcode = '22023';
      end if;
      insert into public.profile_values (community_id, user_id, field_id, person, value_photo_id)
      values (p_community, v_member.user_id, v_field.id, v_person, (v_value #>> '{}')::uuid);
    end case;
  end loop;

  return private.finish_profile_save(p_community, v_member.user_id);
end
$$;

-- A photo you just uploaded (both files) put in its place on your profile:
-- p_slot {"kind": "icon"} | {"kind": "main", "index": 0-2} | {"kind": "field", "field_id": ..., "person": 1|2}.
-- p_photo {path, thumb_path, width, height, taken_in_app}. Taken in app photos are dated now.
-- The photo it replaces is deleted. Returns {id, score, removed: [files to delete]}.
create function public.add_profile_photo(p_community uuid, p_photo jsonb, p_slot jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
  v_kind text := p_slot ->> 'kind';
  v_index integer := (p_slot ->> 'index')::integer;
  v_person smallint := coalesce((p_slot ->> 'person')::smallint, 1);
  v_field public.profile_fields;
  v_id uuid;
begin
  if v_kind is null or v_kind not in ('icon', 'main', 'field') or (v_kind = 'main' and v_index is distinct from least(greatest(v_index, 0), 2)) then
    raise exception 'unknown photo place' using errcode = '22023';
  end if;
  if v_kind = 'field' then
    select * into v_field from public.profile_fields
    where id = (p_slot ->> 'field_id')::uuid and community_id = p_community and kind = 'photo';
    if not found or v_person not in (1, 2) or not private.field_applies(
      v_field, v_member.status_id, coalesce((select people from public.community_options where id = v_member.status_id), 1::smallint), v_person
    ) then
      raise exception 'no such photo field on this profile' using errcode = '22023';
    end if;
  end if;

  v_id := private.insert_profile_photo(p_community, p_photo);

  if v_kind = 'icon' then
    update public.members set icon_photo_id = v_id where community_id = p_community and user_id = v_member.user_id;
  elsif v_kind = 'main' then
    update public.members
    set main_photo_ids = case
      when v_index < cardinality(main_photo_ids) then array(
        select case when i.n = v_index + 1 then v_id else i.id end from unnest(main_photo_ids) with ordinality as i (id, n) order by i.n)
      else main_photo_ids || v_id
    end
    where community_id = p_community and user_id = v_member.user_id;
  else
    insert into public.profile_values (community_id, user_id, field_id, person, value_photo_id)
    values (p_community, v_member.user_id, v_field.id, v_person, v_id)
    on conflict (field_id, user_id, person) do update
    set value_text = null, value_num = null, value_bool = null, value_date = null, value_photo_id = excluded.value_photo_id;
  end if;

  return private.finish_profile_save(p_community, v_member.user_id) || jsonb_build_object('id', v_id);
end
$$;

-- Take one of your profile photos off your profile (icon, a main photo, or a photo answer); it is deleted.
create function public.remove_profile_photo(p_community uuid, p_photo uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
begin
  update public.members
  set icon_photo_id = nullif(icon_photo_id, p_photo),
      main_photo_ids = array_remove(main_photo_ids, p_photo)
  where community_id = p_community and user_id = v_member.user_id;
  delete from public.profile_values
  where community_id = p_community and user_id = v_member.user_id and value_photo_id = p_photo;
  return private.finish_profile_save(p_community, v_member.user_id);
end
$$;

-- A32: link to another approved member (p_on) or remove the link. At most 3 links (D23).
create function public.set_profile_link(p_community uuid, p_linked uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
begin
  if not p_on then
    delete from public.profile_links
    where community_id = p_community and user_id = v_member.user_id and linked_user_id = p_linked;
    return;
  end if;

  if v_member.state <> 'approved' then
    raise exception 'only members can link profiles' using errcode = '42501';
  end if;
  if p_linked = v_member.user_id or not exists (
    select 1 from public.members
    where community_id = p_community and user_id = p_linked and state = 'approved' and not is_system
  ) then
    raise exception 'no such member' using errcode = '22023';
  end if;

  insert into public.profile_links (community_id, user_id, linked_user_id)
  values (p_community, v_member.user_id, p_linked)
  on conflict do nothing;

  -- The member row is locked, so two adds can't both pass this count.
  if (select count(*) from public.profile_links where community_id = p_community and user_id = v_member.user_id) > 3 then
    raise exception 'at most 3 linked profiles' using errcode = '23514';
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Writes (community admin)

-- A21: the community admin changes a member's Status (D4). The profile then shows that Status's
-- fields; answers to the old Status's fields are kept, in case it is changed back.
create function public.set_member_status(p_community uuid, p_user uuid, p_status uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_people smallint;
begin
  perform private.require_community_admin(p_community);
  select people into v_people from public.community_options
  where id = p_status and community_id = p_community and list = 'status' and active;
  if not found then
    raise exception 'unknown Status' using errcode = '22023';
  end if;

  update public.members
  set status_id = p_status,
      birth_date_2 = case when v_people = 2 then birth_date_2 end
  where community_id = p_community and user_id = p_user and not is_system;
  if not found then
    raise exception 'no such member' using errcode = '22023';
  end if;

  update public.members set score = private.compute_score(p_community, p_user)
  where community_id = p_community and user_id = p_user;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.own_member_for_update(uuid), private.field_applies(public.profile_fields, uuid, smallint, smallint),
  private.compute_score(uuid, uuid), private.finish_profile_save(uuid, uuid), private.insert_profile_photo(uuid, jsonb),
  private.photo_json(public.photos) from public;

revoke execute on function public.profile(uuid, uuid), public.profile_cards(uuid, integer, smallint, uuid),
  public.member_names(uuid, text, integer), public.save_profile(uuid, jsonb, jsonb), public.add_profile_photo(uuid, jsonb, jsonb),
  public.remove_profile_photo(uuid, uuid), public.set_profile_link(uuid, uuid, boolean),
  public.set_member_status(uuid, uuid, uuid) from public, anon;
grant execute on function public.profile(uuid, uuid), public.profile_cards(uuid, integer, smallint, uuid),
  public.member_names(uuid, text, integer), public.save_profile(uuid, jsonb, jsonb), public.add_profile_photo(uuid, jsonb, jsonb),
  public.remove_profile_photo(uuid, uuid), public.set_profile_link(uuid, uuid, boolean),
  public.set_member_status(uuid, uuid, uuid) to authenticated;
