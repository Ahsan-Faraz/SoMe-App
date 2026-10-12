-- Step 2: profile builder and choice lists (docs/backend-design.md §4.3, §4.5, §6.4).
-- The community admin owns these: the Status and District lists (community_options) and the
-- profile fields with their choices. Members read them; nobody deletes them. A field or choice is
-- retired (active = false), never deleted, so answers given to it stay valid (step 3).
-- Writes go through three security invoker RPCs, so RLS and the column grants below still apply.

-- ---------------------------------------------------------------------------------------------
-- Helpers

-- Admin-typed text that members read: {"en": "Bike type"}, one entry per language (ADR 0001).
create function private.valid_label(p_label jsonb, p_max integer) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_label) = 'object'
    and p_label <> '{}'::jsonb
    and not exists (
      select 1 from jsonb_each(p_label) as e
      where e.key !~ '^[a-z]{2}$'
        or jsonb_typeof(e.value) <> 'string'
        or char_length(e.value #>> '{}') not between 1 and p_max
        or e.value #>> '{}' <> btrim(e.value #>> '{}')
    )
$$;

-- Every community the caller has an account in, applicants included: they fill in their profile
-- (Status first, then its fields) before they apply.
create function private.member_communities() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select community_id from public.members
  where user_id = (select auth.uid()) and state in ('profile', 'applied', 'approved')
$$;

-- RPC guard: a clear error instead of RLS silently matching no rows.
create function private.require_community_admin(p_community uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not (select private.is_community_admin(p_community)) then
    raise exception 'only the community admin can change the profile builder' using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Status and District choices, per community (D2, D3).

create table public.community_options (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  list text not null check (list in ('status', 'district')),
  label jsonb not null check (private.valid_label(label, 40)),
  -- Status only: a couple is 2 people (second birth date, per-person fields answered twice).
  people smallint not null default 1 check (people in (1, 2)),
  position smallint not null check (position between 0 and 999),
  active boolean not null default true, -- retired choices stay on the profiles that have them
  created_at timestamptz not null default now(),
  check (list = 'status' or people = 1),
  -- Target of (community_id, status_id) foreign keys in step 3; also the community_id index.
  unique (community_id, id)
);

-- ---------------------------------------------------------------------------------------------
-- Profile fields (D1, D4, D6) and the choices of pick one / pick several fields.

create table public.profile_fields (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'), -- stable id for code and saved filters
  label jsonb not null check (private.valid_label(label, 80)),
  kind text not null check (kind in ('short_text', 'long_text', 'yes_no', 'pick_one', 'pick_several', 'number', 'date', 'photo')),
  required boolean not null default false, -- must be filled before applying
  searchable boolean not null default false, -- shown in the profile filter (G1)
  on_card boolean not null default false, -- shown on the Profiles list card
  per_person boolean not null default false, -- couples answer it twice (Q3)
  for_statuses uuid[] check (cardinality(for_statuses) between 1 and 50), -- null = every Status
  max_length integer check (max_length between 1 and 32000), -- text kinds; null = the kind's default
  position smallint not null check (position between 0 and 999),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (max_length is null or kind in ('short_text', 'long_text')),
  check (not searchable or kind <> 'photo'),
  unique (community_id, key),
  unique (community_id, id)
);

create table public.profile_field_options (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  field_id uuid not null,
  label jsonb not null check (private.valid_label(label, 80)),
  position smallint not null check (position between 0 and 999),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Same community as its field, whatever the caller sends.
  foreign key (community_id, field_id) references public.profile_fields (community_id, id) on delete cascade
);

create index profile_field_options_field on public.profile_field_options (community_id, field_id, position);

-- A field's Statuses must be Status choices of the same community (an array can't have a foreign key).
create function private.check_field_statuses() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.for_statuses is not null then
    new.for_statuses := array(select distinct unnest(new.for_statuses));
    if exists (
      select 1 from unnest(new.for_statuses) as s (id)
      where not exists (
        select 1 from public.community_options o
        where o.id = s.id and o.community_id = new.community_id and o.list = 'status'
      )
    ) then
      raise exception 'for_statuses must be Status choices of this community' using errcode = '23503';
    end if;
  end if;
  return new;
end
$$;

create trigger profile_fields_check_statuses
  before insert or update of for_statuses on public.profile_fields
  for each row execute function private.check_field_statuses();

-- Choices only belong to pick one / pick several fields. field_id can't change after insert (grants).
create function private.check_option_field() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profile_fields
    where id = new.field_id and kind in ('pick_one', 'pick_several')
  ) then
    raise exception 'only pick one and pick several fields have choices' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger profile_field_options_check_field
  before insert on public.profile_field_options
  for each row execute function private.check_option_field();

-- ---------------------------------------------------------------------------------------------
-- Security. Members of the community read; the community admin inserts and updates; nobody
-- deletes (retire instead). key, kind and community never change, so answers can't be orphaned.

alter table public.community_options enable row level security;
alter table public.profile_fields enable row level security;
alter table public.profile_field_options enable row level security;

revoke all on public.community_options, public.profile_fields, public.profile_field_options from anon, authenticated;
grant select on public.community_options, public.profile_fields, public.profile_field_options to authenticated;

grant insert (community_id, list, label, people, position, active) on public.community_options to authenticated;
grant update (label, people, position, active) on public.community_options to authenticated;

grant insert (community_id, key, label, kind, required, searchable, on_card, per_person, for_statuses, max_length, position, active)
  on public.profile_fields to authenticated;
grant update (label, required, searchable, on_card, per_person, for_statuses, max_length, position, active)
  on public.profile_fields to authenticated;

grant insert (community_id, field_id, label, position, active) on public.profile_field_options to authenticated;
grant update (label, position, active) on public.profile_field_options to authenticated;

create policy community_options_read on public.community_options
  for select to authenticated using (community_id in (select private.member_communities()));
create policy community_options_create on public.community_options
  for insert to authenticated with check (community_id in (select private.admin_communities()));
create policy community_options_edit on public.community_options
  for update to authenticated
  using (community_id in (select private.admin_communities()))
  with check (community_id in (select private.admin_communities()));

create policy profile_fields_read on public.profile_fields
  for select to authenticated using (community_id in (select private.member_communities()));
create policy profile_fields_create on public.profile_fields
  for insert to authenticated with check (community_id in (select private.admin_communities()));
create policy profile_fields_edit on public.profile_fields
  for update to authenticated
  using (community_id in (select private.admin_communities()))
  with check (community_id in (select private.admin_communities()));

create policy profile_field_options_read on public.profile_field_options
  for select to authenticated using (community_id in (select private.member_communities()));
create policy profile_field_options_create on public.profile_field_options
  for insert to authenticated with check (community_id in (select private.admin_communities()));
create policy profile_field_options_edit on public.profile_field_options
  for update to authenticated
  using (community_id in (select private.admin_communities()))
  with check (community_id in (select private.admin_communities()));

-- ---------------------------------------------------------------------------------------------
-- Admin RPCs. Each saves one screen in one round trip and one transaction.
-- Labels are written in the community's default language; other languages already there are kept.

-- A readable, unique key from a new field's label: "Bike type" -> bike_type, then bike_type_2.
create function private.field_key(p_community uuid, p_label text) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_base text := left(btrim(regexp_replace(lower(translate(p_label, 'ÅÄÖÉÜåäöéü', 'aaoeuaaoeu')), '[^a-z0-9]+', '_', 'g'), '_'), 32);
  v_key text;
  v_n integer := 1;
begin
  if v_base !~ '^[a-z]' then
    v_base := rtrim('field_' || v_base, '_');
  end if;
  v_key := v_base;
  while exists (select 1 from public.profile_fields where community_id = p_community and key = v_key) loop
    v_n := v_n + 1;
    v_key := v_base || '_' || v_n;
  end loop;
  return v_key;
end
$$;

-- The Status or District list, in its new order: [{id?, label, people?, active?}, ...].
-- Items with an id are updated, items without one are added. Missing items are left as they are.
create function public.save_community_options(p_community uuid, p_list text, p_items jsonb)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_locale text;
  v_count integer;
begin
  perform private.require_community_admin(p_community);
  if p_list is null or p_list not in ('status', 'district') then
    raise exception 'unknown list' using errcode = '22023';
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

  update public.community_options o
  set label = o.label || jsonb_build_object(v_locale, btrim(e.item ->> 'label')),
      people = case when p_list = 'status' then coalesce((e.item ->> 'people')::smallint, o.people) else 1 end,
      position = (e.n - 1)::smallint,
      active = coalesce((e.item ->> 'active')::boolean, o.active)
  from jsonb_array_elements(p_items) with ordinality as e (item, n)
  where e.item ->> 'id' is not null
    and o.id = (e.item ->> 'id')::uuid and o.community_id = p_community and o.list = p_list;
  get diagnostics v_count = row_count;
  if v_count <> (select count(*) from jsonb_array_elements(p_items) as e (item) where e.item ->> 'id' is not null) then
    raise exception 'unknown choice' using errcode = '22023';
  end if;

  insert into public.community_options (community_id, list, label, people, position, active)
  select p_community, p_list, jsonb_build_object(v_locale, btrim(e.item ->> 'label')),
    case when p_list = 'status' then coalesce((e.item ->> 'people')::smallint, 1) else 1 end,
    (e.n - 1)::smallint, coalesce((e.item ->> 'active')::boolean, true)
  from jsonb_array_elements(p_items) with ordinality as e (item, n)
  where e.item ->> 'id' is null;
end
$$;

-- One field and, for pick fields, its choices in their new order. Returns the field id.
-- p_field: {id?, label, kind (new fields only), required, searchable, on_card, per_person,
--           for_statuses (null = every Status), max_length, active}
-- p_options: [{id?, label, active?}, ...]
create function public.save_profile_field(p_community uuid, p_field jsonb, p_options jsonb default '[]')
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_locale text;
  v_id uuid := (p_field ->> 'id')::uuid;
  v_label text := btrim(p_field ->> 'label');
  v_statuses uuid[] := case when jsonb_typeof(p_field -> 'for_statuses') = 'array'
    then array(select jsonb_array_elements_text(p_field -> 'for_statuses')::uuid) end;
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
      community_id, key, label, kind, required, searchable, on_card, per_person, for_statuses, max_length, position, active
    ) values (
      p_community,
      private.field_key(p_community, v_label),
      jsonb_build_object(v_locale, v_label),
      p_field ->> 'kind',
      coalesce((p_field ->> 'required')::boolean, false),
      coalesce((p_field ->> 'searchable')::boolean, false),
      coalesce((p_field ->> 'on_card')::boolean, false),
      coalesce((p_field ->> 'per_person')::boolean, false),
      v_statuses,
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
        per_person = coalesce((p_field ->> 'per_person')::boolean, f.per_person),
        for_statuses = v_statuses,
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

-- The order of the fields on the profile: p_ids top to bottom.
create function public.reorder_profile_fields(p_community uuid, p_ids uuid[])
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform private.require_community_admin(p_community);
  if cardinality(p_ids) > 1000 then
    raise exception 'too many fields' using errcode = '22023';
  end if;
  update public.profile_fields f
  set position = (o.n - 1)::smallint
  from unnest(p_ids) with ordinality as o (id, n)
  where f.id = o.id and f.community_id = p_community;
end
$$;

revoke execute on function private.valid_label(jsonb, integer), private.member_communities(),
  private.require_community_admin(uuid), private.check_field_statuses(), private.check_option_field(),
  private.field_key(uuid, text) from public;
grant execute on function private.valid_label(jsonb, integer), private.member_communities(),
  private.require_community_admin(uuid), private.field_key(uuid, text) to authenticated;
grant execute on function private.valid_label(jsonb, integer) to service_role; -- the label checks

revoke execute on function public.save_community_options(uuid, text, jsonb), public.save_profile_field(uuid, jsonb, jsonb),
  public.reorder_profile_fields(uuid, uuid[]) from public, anon;
grant execute on function public.save_community_options(uuid, text, jsonb), public.save_profile_field(uuid, jsonb, jsonb),
  public.reorder_profile_fields(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Seed: Biking Stockholm's lists and fields (Q1: District = Sweden's 21 regions).

do $$
declare
  v_community uuid := (select id from public.communities where slug = 'biking-stockholm');
  v_singles uuid[];
  v_couples uuid[];
  v_other uuid[];
begin
  if v_community is null then
    return;
  end if;

  insert into public.community_options (community_id, list, label, people, position)
  select v_community, 'status', jsonb_build_object('en', s.label), s.people, (s.n - 1)::smallint
  from unnest(
    array['Man', 'Woman', 'Other', 'Couple MF', 'Couple MM', 'Couple FF'],
    array[1, 1, 1, 2, 2, 2]::smallint[]
  ) with ordinality as s (label, people, n);

  -- Stockholm first for this community, then alphabetical.
  insert into public.community_options (community_id, list, label, position)
  select v_community, 'district', jsonb_build_object('en', d.label), (d.n - 1)::smallint
  from unnest(array[
    'Stockholm', 'Blekinge', 'Dalarna', 'Gotland', 'Gävleborg', 'Halland', 'Jämtland', 'Jönköping',
    'Kalmar', 'Kronoberg', 'Norrbotten', 'Skåne', 'Södermanland', 'Uppsala', 'Värmland', 'Västerbotten',
    'Västernorrland', 'Västmanland', 'Västra Götaland', 'Örebro', 'Östergötland'
  ]) with ordinality as d (label, n);

  select array_agg(id order by position) filter (where people = 1 and label ->> 'en' <> 'Other'),
         array_agg(id order by position) filter (where people = 2),
         array_agg(id order by position) filter (where label ->> 'en' = 'Other')
  into v_singles, v_couples, v_other
  from public.community_options where community_id = v_community and list = 'status';

  insert into public.profile_fields (community_id, key, label, kind, required, searchable, on_card, per_person, for_statuses, max_length, position)
  values
    (v_community, 'headline', '{"en": "Headline"}', 'short_text', false, false, true, false, null, 120, 0),
    (v_community, 'about', '{"en": "About the riding"}', 'long_text', true, false, false, false, v_singles || v_other, null, 1),
    (v_community, 'about_us', '{"en": "About us"}', 'long_text', true, false, false, false, v_couples, null, 2),
    (v_community, 'bike_type', '{"en": "Bike type"}', 'pick_one', false, true, true, true, null, null, 3),
    (v_community, 'ride_days', '{"en": "Preferred days"}', 'pick_several', false, true, false, false, null, null, 4),
    (v_community, 'ride_style', '{"en": "How I ride"}', 'pick_several', false, true, false, false, v_other, null, 5),
    (v_community, 'rides_per_month', '{"en": "Rides per month"}', 'number', false, true, false, true, null, null, 6),
    (v_community, 'riding_since', '{"en": "Riding since"}', 'date', false, false, false, true, null, null, 7),
    (v_community, 'own_bike', '{"en": "I own a bike"}', 'yes_no', false, true, false, true, null, null, 8),
    (v_community, 'ride_together', '{"en": "We ride together"}', 'yes_no', false, false, false, false, v_couples, null, 9),
    (v_community, 'area', '{"en": "Area"}', 'short_text', false, false, false, false, null, 80, 10),
    (v_community, 'bike_photo', '{"en": "My bike"}', 'photo', false, false, false, false, null, null, 11);

  insert into public.profile_field_options (community_id, field_id, label, position)
  select v_community, f.id, jsonb_build_object('en', o.label), (o.n - 1)::smallint
  from public.profile_fields f
  cross join lateral unnest(case f.key
    when 'bike_type' then array['Gravel', 'Road', 'MTB']
    when 'ride_days' then array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    when 'ride_style' then array['Commuting', 'Touring', 'Racing', 'Social rides']
  end) with ordinality as o (label, n)
  where f.community_id = v_community and f.kind in ('pick_one', 'pick_several');
end
$$;
