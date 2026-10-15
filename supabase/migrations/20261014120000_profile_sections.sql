-- Step 3, client feedback 261013 (docs/backend-design.md §2 D3/D4/D8/D16, §4.3–§4.6).
--
-- 1. Substatuses: a Status lists its people as substatuses with a count (Couple MF = 1 × The Man +
--    1 × The Woman; a family could be 2 × Adult + 3 × Kid). A field shows in the main section, or in
--    the section of each person whose substatus it is set for. Replaces "2 people" and per-person
--    fields; any number of people per Status works.
-- 2. Places: Country → District (a district belongs to a country). City per district comes later
--    the same way (parent_id).
-- 3. One profile image (the icon and the search card photo); more photos are photo fields.
-- 4. Basic fields the community admin can switch off. Status is always on: it decides the fields.
-- 5. Birth dates per person, so every person of a Status has an age.

do $$
begin
  if exists (select 1 from public.profile_values) or exists (select 1 from public.profile_value_options)
    or exists (select 1 from public.members where birth_date is not null or birth_date_2 is not null)
    or exists (select 1 from public.photos) then
    raise exception 'profile answers exist: map person 1/2 to substatus people before running this migration';
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Lists: Status, Substatus, Country, District

alter table public.community_options
  drop constraint community_options_check,
  drop constraint community_options_list_check,
  drop column people,
  add column parent_id uuid, -- a district's country
  add constraint community_options_list_check check (list in ('status', 'substatus', 'country', 'district')),
  add constraint community_options_parent_fk foreign key (community_id, parent_id) references public.community_options (community_id, id);

-- Every community with districts gets its country; Biking Stockholm's are Sweden's regions.
insert into public.community_options (community_id, list, label, position)
select distinct c.id, 'country', jsonb_build_object(c.default_locale, 'Sweden'), 0::smallint
from public.communities c
where exists (select 1 from public.community_options o where o.community_id = c.id and o.list = 'district');

update public.community_options d
set parent_id = s.id
from public.community_options s
where d.list = 'district' and s.list = 'country' and s.community_id = d.community_id;

alter table public.community_options
  add constraint community_options_parent_check check ((list = 'district') = (parent_id is not null));

-- A district's parent is a country of the same community (the foreign key checks the community).
create function private.check_option_parent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.community_options where id = new.parent_id and list = 'country'
  ) then
    raise exception 'a district belongs to a country' using errcode = '23503';
  end if;
  return new;
end
$$;

create trigger community_options_check_parent
  before insert or update of parent_id on public.community_options
  for each row execute function private.check_option_parent();

grant insert (parent_id) on public.community_options to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The people of a Status: substatuses with a count, in order.

create table public.status_slots (
  community_id uuid not null,
  status_id uuid not null,
  substatus_id uuid not null,
  count smallint not null check (count between 1 and 20),
  position smallint not null check (position between 0 and 49),
  primary key (status_id, substatus_id),
  foreign key (community_id, status_id) references public.community_options (community_id, id),
  foreign key (community_id, substatus_id) references public.community_options (community_id, id)
);

create index status_slots_community on public.status_slots (community_id);

create function private.check_status_slot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.community_options where id = new.status_id and list = 'status')
    or not exists (select 1 from public.community_options where id = new.substatus_id and list = 'substatus') then
    raise exception 'a Status lists Substatuses' using errcode = '23503';
  end if;
  return new;
end
$$;

create trigger status_slots_check
  before insert or update on public.status_slots
  for each row execute function private.check_status_slot();

alter table public.status_slots enable row level security;
revoke all on public.status_slots from anon, authenticated;
grant select, insert, delete on public.status_slots to authenticated;
grant select on public.status_slots to service_role; -- the cached builder (features/fields/queries.ts)

create policy status_slots_read on public.status_slots
  for select to authenticated using (community_id in (select private.member_communities()));
create policy status_slots_create on public.status_slots
  for insert to authenticated with check (community_id in (select private.admin_communities()));
create policy status_slots_remove on public.status_slots
  for delete to authenticated using (community_id in (select private.admin_communities()));

-- Each person of a Status, in order: (substatus, n) with n = 1..count. A Status without
-- substatuses is one person in the main section: (null, 0).
create function private.status_people(p_status uuid)
returns table (substatus_id uuid, n smallint, k bigint)
language sql stable security definer set search_path = '' as $$
  select s.substatus_id, g.n::smallint, row_number() over (order by s.position, g.n)
  from public.status_slots s cross join generate_series(1, s.count) as g (n)
  where s.status_id = p_status
  union all
  select null::uuid, 0::smallint, 1::bigint
  where p_status is not null and not exists (select 1 from public.status_slots where status_id = p_status)
$$;

-- ---------------------------------------------------------------------------------------------
-- Fields: "Show in section for Substatus" replaces "per person".

alter table public.profile_fields
  add column for_substatuses uuid[] check (cardinality(for_substatuses) between 1 and 50); -- null = main section

create function private.check_field_substatuses() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.for_substatuses is not null then
    new.for_substatuses := array(select distinct unnest(new.for_substatuses));
    if exists (
      select 1 from unnest(new.for_substatuses) as s (id)
      where not exists (
        select 1 from public.community_options o
        where o.id = s.id and o.community_id = new.community_id and o.list = 'substatus'
      )
    ) then
      raise exception 'for_substatuses must be Substatus choices of this community' using errcode = '23503';
    end if;
  end if;
  return new;
end
$$;

create trigger profile_fields_check_substatuses
  before insert or update of for_substatuses on public.profile_fields
  for each row execute function private.check_field_substatuses();

grant insert (for_substatuses), update (for_substatuses) on public.profile_fields to authenticated;

-- Biking Stockholm: one substatus per person; singles are one of them (client choice), couples two.
do $$
declare
  v_community uuid := (select id from public.communities where slug = 'biking-stockholm');
begin
  if v_community is null then
    return;
  end if;

  insert into public.community_options (community_id, list, label, position)
  select v_community, 'substatus', jsonb_build_object('en', s.label), (s.n - 1)::smallint
  from unnest(array['The Man', 'The Woman', 'The Other']) with ordinality as s (label, n);

  insert into public.status_slots (community_id, status_id, substatus_id, count, position)
  select v_community, st.id, sub.id, x.count, x.position
  from (values
    ('Man', 'The Man', 1, 0), ('Woman', 'The Woman', 1, 0), ('Other', 'The Other', 1, 0),
    ('Couple MF', 'The Man', 1, 0), ('Couple MF', 'The Woman', 1, 1),
    ('Couple MM', 'The Man', 2, 0), ('Couple FF', 'The Woman', 2, 0)
  ) as x (status, substatus, count, position)
  join public.community_options st on st.community_id = v_community and st.list = 'status' and st.label ->> 'en' = x.status
  join public.community_options sub on sub.community_id = v_community and sub.list = 'substatus' and sub.label ->> 'en' = x.substatus;

  update public.profile_fields
  set for_substatuses = (select array_agg(id order by position) from public.community_options where community_id = v_community and list = 'substatus')
  where community_id = v_community and per_person;
end
$$;

alter table public.profile_fields drop column per_person;

-- ---------------------------------------------------------------------------------------------
-- Basic fields the community admin switches on or off (Status is always on).

alter table public.communities
  add column show_looking_for boolean not null default true,
  add column show_visibility boolean not null default true, -- off: every profile is visible in search
  add column show_photo boolean not null default true,
  add column show_score boolean not null default true,
  add column show_age boolean not null default true,
  add column show_country boolean not null default true,
  add column show_district boolean not null default true,
  add column show_place boolean not null default true,
  add column show_links boolean not null default true;

grant select (
  id, show_looking_for, show_visibility, show_photo, show_score, show_age, show_country, show_district, show_place, show_links
) on public.communities to service_role; -- the cached builder

-- ---------------------------------------------------------------------------------------------
-- Members: one profile image, a country, birth dates per person (profile_people).

drop function public.profile(uuid, uuid), public.profile_cards(uuid, integer, smallint, uuid), public.member_names(uuid, text, integer),
  public.save_profile(uuid, jsonb, jsonb), public.add_profile_photo(uuid, jsonb, jsonb), public.remove_profile_photo(uuid, uuid),
  public.set_member_status(uuid, uuid, uuid), public.save_community_options(uuid, text, jsonb);
drop function private.compute_score(uuid, uuid), private.finish_profile_save(uuid, uuid),
  private.field_applies(public.profile_fields, uuid, smallint, smallint);

alter table public.members
  drop constraint members_icon_fk,
  drop column icon_photo_id,
  drop column main_photo_ids,
  drop column birth_date,
  drop column birth_date_2,
  add column country_id uuid,
  add column photo_id uuid, -- the profile image: icon and search card
  add constraint members_country_fk foreign key (community_id, country_id) references public.community_options (community_id, id),
  add constraint members_photo_fk foreign key (community_id, photo_id) references public.photos (community_id, id) on delete set null (photo_id);

grant select (country_id, photo_id) on public.members to authenticated;

create table public.profile_people (
  community_id uuid not null,
  user_id uuid not null,
  substatus_id uuid, -- null = the main person of a Status without substatuses
  n smallint not null check (n between 0 and 20),
  birth_date date not null check (birth_date >= '1900-01-01'),
  check ((substatus_id is null) = (n = 0)),
  constraint profile_people_person_uq unique nulls not distinct (community_id, user_id, substatus_id, n),
  foreign key (community_id, user_id) references public.members on delete cascade,
  foreign key (community_id, substatus_id) references public.community_options (community_id, id)
);

alter table public.profile_people enable row level security;
revoke all on public.profile_people from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Answers: per section person (substatus, n) instead of person 1/2.

alter table public.profile_values
  drop constraint profile_values_pkey,
  drop column person,
  add column substatus_id uuid,
  add column n smallint not null default 0 check (n between 0 and 20),
  add constraint profile_values_person_check check ((substatus_id is null) = (n = 0)),
  add constraint profile_values_answer_uq unique nulls not distinct (field_id, user_id, substatus_id, n),
  add constraint profile_values_substatus_fk foreign key (community_id, substatus_id) references public.community_options (community_id, id);

alter table public.profile_value_options
  drop constraint profile_value_options_pkey,
  drop column person,
  add column substatus_id uuid,
  add column n smallint not null default 0 check (n between 0 and 20),
  add constraint profile_value_options_person_check check ((substatus_id is null) = (n = 0)),
  add constraint profile_value_options_answer_uq unique nulls not distinct (field_id, user_id, substatus_id, n, option_id),
  add constraint profile_value_options_substatus_fk foreign key (community_id, substatus_id) references public.community_options (community_id, id);

-- ---------------------------------------------------------------------------------------------
-- Helpers

-- Does this field belong on a profile with this Status, for this person? Main-section fields have
-- no substatuses and the person (null, 0); the others go to each person of a listed substatus.
create function private.field_applies(p_field public.profile_fields, p_status uuid, p_substatus uuid, p_n smallint)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_field.active, false)
    and p_status is not null
    and (p_field.for_statuses is null or p_status = any (p_field.for_statuses))
    and case
      when p_field.for_substatuses is null then p_substatus is null and p_n = 0
      else p_substatus = any (p_field.for_substatuses) and exists (
        select 1 from public.status_slots s where s.status_id = p_status and s.substatus_id = p_substatus and p_n between 1 and s.count
      )
    end
$$;

-- Profile score (D21, Q2 default rule), capped at 100. Stored, recomputed on every save.
--   +10 per long text field answered with at least 200 characters (max +40)
--   +10 for a profile image, +30 more if it is Taken in app
--   +20 when every required field is filled (for every person it applies to)
create function private.compute_score(p_community uuid, p_user uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  with m as (
    select m.status_id, m.photo_id from public.members m where m.community_id = p_community and m.user_id = p_user
  ),
  slots as ( -- every (field, person) this profile has: the main section and each person
    select f.id, f.kind, f.required, p.substatus_id, p.n
    from m
    cross join public.profile_fields f
    cross join lateral (
      select null::uuid as substatus_id, 0::smallint as n
      union
      select substatus_id, n from private.status_people(m.status_id) where n > 0
    ) as p
    where f.community_id = p_community and private.field_applies(f, m.status_id, p.substatus_id, p.n)
  )
  select least(100,
    least(40, 10 * (
      select count(distinct v.field_id) from public.profile_values v
      join slots s on s.id = v.field_id and s.substatus_id is not distinct from v.substatus_id and s.n = v.n
      where v.user_id = p_user and s.kind = 'long_text' and char_length(v.value_text) >= 200
    ))
    + case when m.photo_id is not null then 10 else 0 end
    + case when exists (select 1 from public.photos p where p.id = m.photo_id and p.taken_in_app) then 30 else 0 end
    + case when m.status_id is not null and not exists (
        select 1 from slots s
        where s.required
          and not exists (select 1 from public.profile_values v where v.field_id = s.id and v.user_id = p_user and v.substatus_id is not distinct from s.substatus_id and v.n = s.n)
          and not exists (select 1 from public.profile_value_options v where v.field_id = s.id and v.user_id = p_user and v.substatus_id is not distinct from s.substatus_id and v.n = s.n)
      ) then 20 else 0 end
  )::smallint
  from m
$$;

-- Deletes the caller's profile photos nothing uses any more and recomputes the score.
-- Returns {score, removed: [files to delete from Storage]}.
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
      and p.id is distinct from m.photo_id
      and not exists (select 1 from public.profile_values v where v.value_photo_id = p.id)
    returning p.path, p.thumb_path
  )
  select coalesce(array_agg(f.path), '{}') into v_removed
  from gone cross join lateral (values (gone.path), (gone.thumb_path)) as f (path);

  return jsonb_build_object('score', v_score, 'removed', to_jsonb(v_removed));
end
$$;

-- The person a value or birth date is for: {substatus_id, n}; missing = the main section (null, 0).
create function private.person_of(p_item jsonb, out substatus_id uuid, out n smallint)
language sql immutable set search_path = '' as $$
  select (p_item ->> 'substatus_id')::uuid, coalesce((p_item ->> 'n')::smallint, 0::smallint)
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads

-- A3/B1: one profile in one call. Null when the caller may not see it: applicants see only
-- themselves; approved members see approved members; the community admin sees everyone here.
-- Birth dates and the account's creation date only for yourself (and the date for the admin).
create function public.profile(p_community uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_viewer public.members;
  v_member public.members;
  v_own boolean := p_user = v_uid;
  v_admin boolean;
begin
  select * into v_viewer from public.members
  where community_id = p_community and user_id = v_uid and state in ('profile', 'applied', 'approved');
  if not found then
    return null;
  end if;
  v_admin := v_viewer.state = 'approved' and v_viewer.role = 'admin';

  select * into v_member from public.members
  where community_id = p_community and user_id = p_user and not is_system;
  if not found or not (v_own or v_admin or (v_viewer.state = 'approved' and v_member.state = 'approved')) then
    return null;
  end if;

  return jsonb_build_object(
    'user_id', v_member.user_id,
    'username', v_member.username,
    'state', v_member.state,
    'own', v_own,
    'created_at', case when v_own or v_admin then v_member.created_at end,
    'status_id', v_member.status_id,
    'looking_for', to_jsonb(v_member.looking_for),
    'country_id', v_member.country_id,
    'district_id', v_member.district_id,
    'place', v_member.place,
    'visible_in_search', v_member.visible_in_search,
    'score', v_member.score,
    'last_login_at', v_member.last_login_at,
    'photo', (select private.photo_json(p) from public.photos p where p.id = v_member.photo_id),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'substatus_id', s.substatus_id, 'n', s.n,
        'birth_date', case when v_own then pp.birth_date end,
        'age', extract(year from age(current_date, pp.birth_date))::integer
      ) order by s.k)
      from private.status_people(v_member.status_id) as s
      left join public.profile_people pp
        on pp.community_id = p_community and pp.user_id = p_user
        and pp.substatus_id is not distinct from s.substatus_id and pp.n = s.n
    ), '[]'),
    'values', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', v.field_id, 'substatus_id', v.substatus_id, 'n', v.n, 'text', v.value_text, 'num', v.value_num,
        'bool', v.value_bool, 'date', v.value_date, 'photo', private.photo_json(p)
      ))
      from public.profile_values v
      join public.profile_fields f on f.id = v.field_id
      left join public.photos p on p.id = v.value_photo_id
      where v.community_id = p_community and v.user_id = p_user
        and private.field_applies(f, v_member.status_id, v.substatus_id, v.n)
    ), '[]'),
    'choices', coalesce((
      select jsonb_agg(jsonb_build_object('field_id', c.field_id, 'substatus_id', c.substatus_id, 'n', c.n, 'option_ids', c.option_ids))
      from (
        select v.field_id, v.substatus_id, v.n, array_agg(v.option_id order by o.position) as option_ids
        from public.profile_value_options v
        join public.profile_fields f on f.id = v.field_id
        join public.profile_field_options o on o.id = v.option_id
        where v.community_id = p_community and v.user_id = p_user
          and private.field_applies(f, v_member.status_id, v.substatus_id, v.n)
        group by v.field_id, v.substatus_id, v.n
      ) as c
    ), '[]'),
    -- Your own: every link you made, confirmed or not. Someone else's: confirmed links only.
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'username', m.username, 'icon', p.thumb_path, 'confirmed', back.user_id is not null
      ) order by l.created_at)
      from public.profile_links l
      join public.members m on m.community_id = l.community_id and m.user_id = l.linked_user_id and m.state = 'approved'
      left join public.photos p on p.id = m.photo_id
      left join public.profile_links back
        on back.community_id = l.community_id and back.user_id = l.linked_user_id and back.linked_user_id = l.user_id
      where l.community_id = p_community and l.user_id = p_user and (v_own or back.user_id is not null)
    ), '[]'),
    -- Your own only: who has linked to you, so you can link back.
    'linked_you', case when v_own then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', m.username, 'icon', p.thumb_path) order by l.created_at)
      from public.profile_links l
      join public.members m on m.community_id = l.community_id and m.user_id = l.user_id and m.state = 'approved'
      left join public.photos p on p.id = m.photo_id
      where l.community_id = p_community and l.linked_user_id = p_user
    ), '[]') else '[]'::jsonb end
  );
end
$$;

-- A5 cards: approved members visible in search (everyone, when the community switched that
-- choice off), best score first, keyset paged on (score, user_id). Ages in the Status's person order.
create function public.profile_cards(p_community uuid, p_limit integer default 30, p_after_score smallint default null, p_after_user uuid default null)
returns table (
  user_id uuid, username text, status_id uuid, country_id uuid, district_id uuid, place text, ages integer[], score smallint,
  looking_for uuid[], photo_thumb text, photo_taken_in_app boolean
)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.username, m.status_id, m.country_id, m.district_id, m.place,
    array(
      select extract(year from age(current_date, pp.birth_date))::integer
      from private.status_people(m.status_id) as s
      join public.profile_people pp
        on pp.community_id = m.community_id and pp.user_id = m.user_id
        and pp.substatus_id is not distinct from s.substatus_id and pp.n = s.n
      order by s.k
    ),
    m.score, m.looking_for, p.thumb_path, p.taken_in_app
  from public.members m
  join public.communities c on c.id = m.community_id
  left join public.photos p on p.id = m.photo_id
  where (select private.is_approved(p_community))
    and m.community_id = p_community and m.state = 'approved' and not m.is_system
    and (m.visible_in_search or not c.show_visibility)
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
  left join public.photos p on p.id = m.photo_id
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
-- p_profile: any of {status_id, looking_for, country_id, district_id, place, visible_in_search,
--   birth_dates: [{substatus_id, n, date}]}; keys left out stay as they are, and basic fields the
--   community switched off are left as they are. Status is set once (D4).
-- p_values: [{field_id, substatus_id, n, value}] (no substatus = main section). value: string (text,
--   date, pick one), number, boolean, string[] (pick several), photo id (photo); null clears it.
--   Fields left out keep their answers. Returns {score, removed: [files to delete]}.
create function public.save_profile(p_community uuid, p_profile jsonb, p_values jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
  v_show public.communities;
  v_status uuid := v_member.status_id;
  v_item jsonb;
  v_value jsonb;
  v_field public.profile_fields;
  v_sub uuid;
  v_n smallint;
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
  select * into v_show from public.communities where id = p_community;

  -- Status (D4): set once; the community admin changes it (set_member_status).
  if p_profile ? 'status_id' and (p_profile ->> 'status_id')::uuid is distinct from v_status then
    if v_status is not null then
      raise exception 'Status is set once; only the community admin can change it' using errcode = '42501';
    end if;
    v_status := (p_profile ->> 'status_id')::uuid;
    if not exists (select 1 from public.community_options where id = v_status and community_id = p_community and list = 'status' and active) then
      raise exception 'unknown Status' using errcode = '22023';
    end if;
  end if;

  -- Looking for (D5): Status choices of this community.
  if v_show.show_looking_for and p_profile ? 'looking_for' then
    if jsonb_typeof(p_profile -> 'looking_for') is distinct from 'array' then
      raise exception 'looking_for must be an array' using errcode = '22023';
    end if;
    v_picked := array(select distinct x::uuid from jsonb_array_elements_text(p_profile -> 'looking_for') as x);
    if exists (
      select 1 from unnest(v_picked) as s (id)
      where not exists (
        select 1 from public.community_options o
        where o.id = s.id and o.community_id = p_community and o.list = 'status' and (o.active or s.id = any (v_member.looking_for))
      )
    ) then
      raise exception 'looking_for must be Status choices' using errcode = '22023';
    end if;
    v_member.looking_for := v_picked;
  end if;

  -- Country, then a District of that country (D8). Retired choices stay valid where already chosen.
  if v_show.show_country and p_profile ? 'country_id' and (p_profile ->> 'country_id')::uuid is distinct from v_member.country_id then
    v_member.country_id := (p_profile ->> 'country_id')::uuid;
    if v_member.country_id is not null and not exists (
      select 1 from public.community_options where id = v_member.country_id and community_id = p_community and list = 'country' and active
    ) then
      raise exception 'unknown Country' using errcode = '22023';
    end if;
  end if;
  if v_show.show_district and p_profile ? 'district_id' and (p_profile ->> 'district_id')::uuid is distinct from v_member.district_id then
    v_member.district_id := (p_profile ->> 'district_id')::uuid;
    if v_member.district_id is not null and not exists (
      select 1 from public.community_options where id = v_member.district_id and community_id = p_community and list = 'district' and active
    ) then
      raise exception 'unknown District' using errcode = '22023';
    end if;
  end if;
  if v_show.show_country and v_member.district_id is not null then
    -- No Country yet (e.g. a District picked before countries existed): it is the District's.
    if v_member.country_id is null then
      v_member.country_id := (select parent_id from public.community_options where id = v_member.district_id);
    elsif v_member.country_id is distinct from (select parent_id from public.community_options where id = v_member.district_id) then
      raise exception 'the District is not in that Country' using errcode = '22023';
    end if;
  end if;

  if v_show.show_place and p_profile ? 'place' then
    v_member.place := nullif(btrim(p_profile ->> 'place'), '');
  end if;
  if v_show.show_visibility and p_profile ? 'visible_in_search' then
    v_member.visible_in_search := coalesce((p_profile ->> 'visible_in_search')::boolean, true);
  end if;

  update public.members
  set status_id = v_status, looking_for = v_member.looking_for, country_id = v_member.country_id,
      district_id = v_member.district_id, place = v_member.place, visible_in_search = v_member.visible_in_search
  where community_id = p_community and user_id = v_member.user_id;

  -- Birth dates (D7), one per person of the Status.
  if v_show.show_age and p_profile ? 'birth_dates' then
    if jsonb_typeof(p_profile -> 'birth_dates') is distinct from 'array' or jsonb_array_length(p_profile -> 'birth_dates') > 100 then
      raise exception 'birth_dates must be an array' using errcode = '22023';
    end if;
    for v_item in select value from jsonb_array_elements(p_profile -> 'birth_dates') loop
      select p.substatus_id, p.n into v_sub, v_n from private.person_of(v_item) as p;
      if not exists (select 1 from private.status_people(v_status) as s where s.substatus_id is not distinct from v_sub and s.n = v_n) then
        raise exception 'no such person on this profile' using errcode = '22023';
      end if;
      delete from public.profile_people
      where community_id = p_community and user_id = v_member.user_id and substatus_id is not distinct from v_sub and n = v_n;
      continue when nullif(v_item ->> 'date', '') is null;
      if (v_item ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$' or (v_item ->> 'date')::date > current_date then
        raise exception 'a birth date is a past date (YYYY-MM-DD)' using errcode = '22023';
      end if;
      insert into public.profile_people (community_id, user_id, substatus_id, n, birth_date)
      values (p_community, v_member.user_id, v_sub, v_n, (v_item ->> 'date')::date);
    end loop;
  end if;

  -- Answers: each checked against its field's type, choices and section.
  for v_item in select value from jsonb_array_elements(p_values) loop
    select p.substatus_id, p.n into v_sub, v_n from private.person_of(v_item) as p;
    select * into v_field from public.profile_fields
    where id = (v_item ->> 'field_id')::uuid and community_id = p_community;
    if not found or not private.field_applies(v_field, v_status, v_sub, v_n) then
      raise exception 'field % is not on this profile', v_item ->> 'field_id' using errcode = '22023';
    end if;

    v_previous := array(
      select option_id from public.profile_value_options
      where field_id = v_field.id and user_id = v_member.user_id and substatus_id is not distinct from v_sub and n = v_n
    );
    delete from public.profile_values
    where field_id = v_field.id and user_id = v_member.user_id and substatus_id is not distinct from v_sub and n = v_n;
    delete from public.profile_value_options
    where field_id = v_field.id and user_id = v_member.user_id and substatus_id is not distinct from v_sub and n = v_n;

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
      insert into public.profile_values (community_id, user_id, field_id, substatus_id, n, value_text)
      values (p_community, v_member.user_id, v_field.id, v_sub, v_n, v_text);

    when 'number' then
      if jsonb_typeof(v_value) <> 'number' then
        raise exception '% takes a number', v_field.key using errcode = '22023';
      end if;
      insert into public.profile_values (community_id, user_id, field_id, substatus_id, n, value_num)
      values (p_community, v_member.user_id, v_field.id, v_sub, v_n, (v_value #>> '{}')::numeric);

    when 'yes_no' then
      if jsonb_typeof(v_value) <> 'boolean' then
        raise exception '% takes yes or no', v_field.key using errcode = '22023';
      end if;
      insert into public.profile_values (community_id, user_id, field_id, substatus_id, n, value_bool)
      values (p_community, v_member.user_id, v_field.id, v_sub, v_n, (v_value #>> '{}')::boolean);

    when 'date' then
      if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception '% takes a date (YYYY-MM-DD)', v_field.key using errcode = '22023';
      end if;
      insert into public.profile_values (community_id, user_id, field_id, substatus_id, n, value_date)
      values (p_community, v_member.user_id, v_field.id, v_sub, v_n, (v_value #>> '{}')::date);

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
      insert into public.profile_value_options (community_id, user_id, field_id, substatus_id, n, option_id)
      select p_community, v_member.user_id, v_field.id, v_sub, v_n, s.id from unnest(v_picked) as s (id);

    when 'photo' then
      if jsonb_typeof(v_value) <> 'string' or not exists (
        select 1 from public.photos
        where id = (v_value #>> '{}')::uuid and community_id = p_community and owner_id = v_member.user_id and purpose = 'profile'
      ) then
        raise exception '% takes one of your profile photos', v_field.key using errcode = '22023';
      end if;
      insert into public.profile_values (community_id, user_id, field_id, substatus_id, n, value_photo_id)
      values (p_community, v_member.user_id, v_field.id, v_sub, v_n, (v_value #>> '{}')::uuid);
    end case;
  end loop;

  return private.finish_profile_save(p_community, v_member.user_id);
end
$$;

-- A photo you just uploaded (both files) put in its place on your profile:
-- p_slot {"kind": "profile"} (the profile image) | {"kind": "field", "field_id", "substatus_id"?, "n"?}.
-- p_photo {path, thumb_path, width, height, taken_in_app}. Taken in app photos are dated now.
-- The photo it replaces is deleted. Returns {id, score, removed: [files to delete]}.
create function public.add_profile_photo(p_community uuid, p_photo jsonb, p_slot jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
  v_kind text := p_slot ->> 'kind';
  v_field public.profile_fields;
  v_sub uuid;
  v_n smallint;
  v_id uuid;
begin
  if v_kind is null or v_kind not in ('profile', 'field') then
    raise exception 'unknown photo place' using errcode = '22023';
  end if;
  if v_kind = 'profile' and not (select show_photo from public.communities where id = p_community) then
    raise exception 'this community has no profile image' using errcode = '42501';
  end if;
  if v_kind = 'field' then
    select p.substatus_id, p.n into v_sub, v_n from private.person_of(p_slot) as p;
    select * into v_field from public.profile_fields
    where id = (p_slot ->> 'field_id')::uuid and community_id = p_community and kind = 'photo';
    if not found or not private.field_applies(v_field, v_member.status_id, v_sub, v_n) then
      raise exception 'no such photo field on this profile' using errcode = '22023';
    end if;
  end if;

  v_id := private.insert_profile_photo(p_community, p_photo);

  if v_kind = 'profile' then
    update public.members set photo_id = v_id where community_id = p_community and user_id = v_member.user_id;
  else
    insert into public.profile_values (community_id, user_id, field_id, substatus_id, n, value_photo_id)
    values (p_community, v_member.user_id, v_field.id, v_sub, v_n, v_id)
    on conflict on constraint profile_values_answer_uq do update
    set value_text = null, value_num = null, value_bool = null, value_date = null, value_photo_id = excluded.value_photo_id;
  end if;

  return private.finish_profile_save(p_community, v_member.user_id) || jsonb_build_object('id', v_id);
end
$$;

-- Take one of your photos off your profile (the profile image or a photo answer); it is deleted.
create function public.remove_profile_photo(p_community uuid, p_photo uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
begin
  update public.members set photo_id = nullif(photo_id, p_photo)
  where community_id = p_community and user_id = v_member.user_id;
  delete from public.profile_values
  where community_id = p_community and user_id = v_member.user_id and value_photo_id = p_photo;
  return private.finish_profile_save(p_community, v_member.user_id);
end
$$;

-- A32: link to another approved member (p_on) or remove the link. At most 3 links (D23).
-- Communities can switch linked profiles off; removing a link always works.
create or replace function public.set_profile_link(p_community uuid, p_linked uuid, p_on boolean)
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

  if v_member.state <> 'approved' or not (select show_links from public.communities where id = p_community) then
    raise exception 'linking profiles is not open to you here' using errcode = '42501';
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

-- A21: the community admin changes a member's Status (D4). Answers and birth dates of people the
-- new Status doesn't have are kept, in case it is changed back.
create function public.set_member_status(p_community uuid, p_user uuid, p_status uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_community_admin(p_community);
  if not exists (select 1 from public.community_options where id = p_status and community_id = p_community and list = 'status' and active) then
    raise exception 'unknown Status' using errcode = '22023';
  end if;
  update public.members set status_id = p_status where community_id = p_community and user_id = p_user and not is_system;
  if not found then
    raise exception 'no such member' using errcode = '22023';
  end if;
  update public.members set score = private.compute_score(p_community, p_user) where community_id = p_community and user_id = p_user;
end
$$;

-- The basic fields this community shows (p_settings: any of the show_* switches).
create function public.save_profile_builtins(p_community uuid, p_settings jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_community_admin(p_community);
  if jsonb_typeof(p_settings) is distinct from 'object' or exists (
    select 1 from jsonb_each(p_settings) as e
    where e.key not in ('show_looking_for', 'show_visibility', 'show_photo', 'show_score', 'show_age', 'show_country', 'show_district', 'show_place', 'show_links')
      or jsonb_typeof(e.value) <> 'boolean'
  ) then
    raise exception 'settings are show_* switches (true or false)' using errcode = '22023';
  end if;
  update public.communities
  set show_looking_for = coalesce((p_settings ->> 'show_looking_for')::boolean, show_looking_for),
      show_visibility = coalesce((p_settings ->> 'show_visibility')::boolean, show_visibility),
      show_photo = coalesce((p_settings ->> 'show_photo')::boolean, show_photo),
      show_score = coalesce((p_settings ->> 'show_score')::boolean, show_score),
      show_age = coalesce((p_settings ->> 'show_age')::boolean, show_age),
      show_country = coalesce((p_settings ->> 'show_country')::boolean, show_country),
      show_district = coalesce((p_settings ->> 'show_district')::boolean, show_district),
      show_place = coalesce((p_settings ->> 'show_place')::boolean, show_place),
      show_links = coalesce((p_settings ->> 'show_links')::boolean, show_links)
  where id = p_community;
end
$$;

-- A Status, Substatus, Country or District list, in its new order: [{id?, label, active?}, ...].
-- Items with an id are updated, items without one are added; missing items are left as they are.
-- Districts belong to a country: p_parent, and only that country's districts are touched.
-- Status items may carry their people: "slots": [{substatus_id, count}, ...] replaces the old ones.
create function public.save_community_options(p_community uuid, p_list text, p_items jsonb, p_parent uuid default null)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_locale text;
  v_item jsonb;
  v_n bigint;
  v_id uuid;
begin
  perform private.require_community_admin(p_community);
  if p_list is null or p_list not in ('status', 'substatus', 'country', 'district') then
    raise exception 'unknown list' using errcode = '22023';
  end if;
  if (p_list = 'district') <> (p_parent is not null) or (p_parent is not null and not exists (
    select 1 from public.community_options where id = p_parent and community_id = p_community and list = 'country'
  )) then
    raise exception 'districts are saved per country' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'items must be an array of at most 200' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e (item)
    where coalesce((e.item ->> 'active')::boolean, true)
    group by lower(btrim(e.item ->> 'label')) having count(*) > 1
  ) then
    raise exception 'two choices have the same name' using errcode = '23505';
  end if;

  select default_locale into v_locale from public.communities where id = p_community;

  for v_item, v_n in select e.item, e.n from jsonb_array_elements(p_items) with ordinality as e (item, n) loop
    v_id := (v_item ->> 'id')::uuid;
    if v_id is null then
      insert into public.community_options (community_id, list, label, parent_id, position, active)
      values (p_community, p_list, jsonb_build_object(v_locale, btrim(v_item ->> 'label')), p_parent, (v_n - 1)::smallint,
        coalesce((v_item ->> 'active')::boolean, true))
      returning id into v_id;
    else
      update public.community_options o
      set label = o.label || jsonb_build_object(v_locale, btrim(v_item ->> 'label')),
          position = (v_n - 1)::smallint,
          active = coalesce((v_item ->> 'active')::boolean, o.active)
      where o.id = v_id and o.community_id = p_community and o.list = p_list and o.parent_id is not distinct from p_parent;
      if not found then
        raise exception 'unknown choice' using errcode = '22023';
      end if;
    end if;

    if p_list = 'status' and jsonb_typeof(v_item -> 'slots') = 'array' then
      if jsonb_array_length(v_item -> 'slots') > 50 then
        raise exception 'too many substatuses' using errcode = '22023';
      end if;
      delete from public.status_slots where status_id = v_id;
      insert into public.status_slots (community_id, status_id, substatus_id, count, position)
      select p_community, v_id, (s.slot ->> 'substatus_id')::uuid, coalesce((s.slot ->> 'count')::smallint, 1::smallint), (s.n - 1)::smallint
      from jsonb_array_elements(v_item -> 'slots') with ordinality as s (slot, n);
    end if;
  end loop;
end
$$;

-- save_profile_field: "Show in section for" Substatuses replaces "per person".
create or replace function public.save_profile_field(p_community uuid, p_field jsonb, p_options jsonb default '[]')
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_locale text;
  v_id uuid := (p_field ->> 'id')::uuid;
  v_label text := btrim(p_field ->> 'label');
  v_statuses uuid[] := case when jsonb_typeof(p_field -> 'for_statuses') = 'array' and jsonb_array_length(p_field -> 'for_statuses') > 0
    then array(select jsonb_array_elements_text(p_field -> 'for_statuses')::uuid) end;
  v_substatuses uuid[] := case when jsonb_typeof(p_field -> 'for_substatuses') = 'array' and jsonb_array_length(p_field -> 'for_substatuses') > 0
    then array(select jsonb_array_elements_text(p_field -> 'for_substatuses')::uuid) end;
  v_kind text;
  v_active boolean;
  v_count integer;
begin
  perform private.require_community_admin(p_community);
  if jsonb_typeof(p_field) is distinct from 'object' then
    raise exception 'field must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options) > 200 then
    raise exception 'options must be an array of at most 200' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_options) as e (item)
    where coalesce((e.item ->> 'active')::boolean, true)
    group by lower(btrim(e.item ->> 'label')) having count(*) > 1
  ) then
    raise exception 'two choices have the same name' using errcode = '23505';
  end if;

  select default_locale into v_locale from public.communities where id = p_community;

  if v_id is null then
    insert into public.profile_fields (
      community_id, key, label, kind, required, searchable, on_card, for_statuses, for_substatuses, max_length, position, active
    ) values (
      p_community,
      private.field_key(p_community, v_label),
      jsonb_build_object(v_locale, v_label),
      p_field ->> 'kind',
      coalesce((p_field ->> 'required')::boolean, false),
      coalesce((p_field ->> 'searchable')::boolean, false),
      coalesce((p_field ->> 'on_card')::boolean, false),
      v_statuses,
      v_substatuses,
      (p_field ->> 'max_length')::integer,
      (select coalesce(max(position) + 1, 0) from public.profile_fields where community_id = p_community)::smallint,
      coalesce((p_field ->> 'active')::boolean, true)
    )
    returning id, kind, active into v_id, v_kind, v_active;
  else
    update public.profile_fields f
    set label = f.label || jsonb_build_object(v_locale, v_label),
        required = coalesce((p_field ->> 'required')::boolean, f.required),
        searchable = coalesce((p_field ->> 'searchable')::boolean, f.searchable),
        on_card = coalesce((p_field ->> 'on_card')::boolean, f.on_card),
        for_statuses = v_statuses,
        for_substatuses = v_substatuses,
        max_length = (p_field ->> 'max_length')::integer,
        active = coalesce((p_field ->> 'active')::boolean, f.active)
    where f.id = v_id and f.community_id = p_community
    returning f.kind, f.active into v_kind, v_active;
    if not found then
      raise exception 'unknown field' using errcode = '22023';
    end if;
  end if;

  update public.profile_field_options o
  set label = o.label || jsonb_build_object(v_locale, btrim(e.item ->> 'label')),
      position = (e.n - 1)::smallint,
      active = coalesce((e.item ->> 'active')::boolean, o.active)
  from jsonb_array_elements(p_options) with ordinality as e (item, n)
  where e.item ->> 'id' is not null and o.id = (e.item ->> 'id')::uuid and o.field_id = v_id;
  get diagnostics v_count = row_count;
  if v_count <> (select count(*) from jsonb_array_elements(p_options) as e (item) where e.item ->> 'id' is not null) then
    raise exception 'unknown choice' using errcode = '22023';
  end if;

  -- A choice on a field that isn't pick one / pick several is refused by its trigger.
  insert into public.profile_field_options (community_id, field_id, label, position, active)
  select p_community, v_id, jsonb_build_object(v_locale, btrim(e.item ->> 'label')),
    (e.n - 1)::smallint, coalesce((e.item ->> 'active')::boolean, true)
  from jsonb_array_elements(p_options) with ordinality as e (item, n)
  where e.item ->> 'id' is null;

  if v_active and v_kind in ('pick_one', 'pick_several') and not exists (
    select 1 from public.profile_field_options where field_id = v_id and active
  ) then
    raise exception 'a pick field needs at least one choice' using errcode = '23514';
  end if;

  return v_id;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.check_option_parent(), private.check_status_slot(), private.check_field_substatuses(),
  private.status_people(uuid), private.field_applies(public.profile_fields, uuid, uuid, smallint), private.compute_score(uuid, uuid),
  private.finish_profile_save(uuid, uuid), private.person_of(jsonb) from public;

revoke execute on function public.profile(uuid, uuid), public.profile_cards(uuid, integer, smallint, uuid),
  public.member_names(uuid, text, integer), public.save_profile(uuid, jsonb, jsonb), public.add_profile_photo(uuid, jsonb, jsonb),
  public.remove_profile_photo(uuid, uuid), public.set_member_status(uuid, uuid, uuid), public.save_profile_builtins(uuid, jsonb),
  public.save_community_options(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.profile(uuid, uuid), public.profile_cards(uuid, integer, smallint, uuid),
  public.member_names(uuid, text, integer), public.save_profile(uuid, jsonb, jsonb), public.add_profile_photo(uuid, jsonb, jsonb),
  public.remove_profile_photo(uuid, uuid), public.set_member_status(uuid, uuid, uuid), public.save_profile_builtins(uuid, jsonb),
  public.save_community_options(uuid, text, jsonb, uuid) to authenticated;
