-- Step 9: search, filters, swipe, find new (docs/backend-design.md §6.6, §6.16), with the notes table
-- pulled forward from step 10 for "My stars" (§4.8): the filter, the cards and swipe rating all use it.
-- The filter is saved on the account and read by search_profiles itself, so the Profiles list and
-- swipe (A27) show the same result in one call each. search_profiles replaces profile_cards (the
-- unfiltered first page) and find_new replaces group_directory (groups only, no typing).

-- ---------------------------------------------------------------------------------------------
-- Private notes and stars: only the author ever reads them, not even an admin (§4.8). The notes
-- screens (profile ⭐, DM ⭐) move here in step 10.

create table public.notes (
  community_id uuid not null,
  author_id uuid not null,
  subject_id uuid not null,
  body text not null default '' check (char_length(body) <= 32000),
  stars smallint check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (community_id, author_id, subject_id), -- "my stars" in search: one key lookup per profile
  check (author_id <> subject_id),
  check (body <> '' or stars is not null), -- an emptied note is deleted
  foreign key (community_id, author_id) references public.members on delete cascade,
  foreign key (community_id, subject_id) references public.members on delete cascade
);

-- The cascade from the member a note is about.
create index notes_subject on public.notes (community_id, subject_id);

alter table public.notes enable row level security;
revoke all on public.notes from anon, authenticated;
grant select on public.notes to authenticated;

create policy notes_read_own on public.notes
  for select to authenticated using (author_id = (select auth.uid()));

-- p_note: {body?, stars?}; a key left out keeps its value, stars null takes the stars back. Notes are
-- about a member you can see (an approved member, no block either way); the community admin may
-- also keep notes on applicants (A21, the DM ⭐). Anyone else is answered as unknown.
create function public.set_note(p_community uuid, p_subject uuid, p_note jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text;
  v_stars smallint;
begin
  if not (select private.is_approved(p_community)) then
    raise exception 'only members keep notes' using errcode = '42501';
  end if;
  if jsonb_typeof(p_note) is distinct from 'object' then
    raise exception 'a note is an object' using errcode = '22023';
  end if;
  if p_subject is null or p_subject = v_uid or not exists (
    select 1 from public.members m
    where m.community_id = p_community and m.user_id = p_subject and not m.is_system
      and (m.state = 'approved' or (select private.is_community_admin(p_community)))
  ) or private.blocked_pair(p_community, v_uid, p_subject) then
    raise exception 'no such member' using errcode = '22023';
  end if;

  select n.body, n.stars into v_body, v_stars from public.notes n
  where n.community_id = p_community and n.author_id = v_uid and n.subject_id = p_subject
  for update;
  v_body := coalesce(v_body, '');

  if p_note ? 'body' then
    if jsonb_typeof(p_note -> 'body') not in ('string', 'null') then
      raise exception 'a note''s text is a string' using errcode = '22023';
    end if;
    v_body := coalesce(p_note ->> 'body', '');
  end if;
  if p_note ? 'stars' then
    if jsonb_typeof(p_note -> 'stars') = 'null' then
      v_stars := null;
    elsif jsonb_typeof(p_note -> 'stars') = 'number' and (p_note ->> 'stars') ~ '^[1-5]$' then
      v_stars := (p_note ->> 'stars')::smallint;
    else
      raise exception 'stars are 1 to 5' using errcode = '22023';
    end if;
  end if;

  if v_body = '' and v_stars is null then
    delete from public.notes where community_id = p_community and author_id = v_uid and subject_id = p_subject;
    return;
  end if;
  insert into public.notes (community_id, author_id, subject_id, body, stars)
  values (p_community, v_uid, p_subject, v_body, v_stars)
  on conflict (community_id, author_id, subject_id)
  do update set body = excluded.body, stars = excluded.stars, updated_at = now();
end
$$;

-- ---------------------------------------------------------------------------------------------
-- The saved filter (G1, "saved on the account"). Written only by save_search_filter, which keeps
-- known ids and the searchable fields only, so search_profiles can read it without checks.
-- Not readable as a column: search_filter() returns your own.

alter table public.members
  add column search_filter jsonb not null default '{}'
    check (jsonb_typeof(search_filter) = 'object' and pg_column_size(search_filter) <= 32768);

-- '%text%' for LIKE, lower-case, with LIKE's own characters escaped. Null for null.
create function private.like_pattern(p_text text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(lower(btrim(p_text)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- A filter's text: trimmed, '' = none.
create function private.filter_text(p_value jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string' then
    raise exception 'a filter text is a string' using errcode = '22023';
  end if;
  v_text := btrim(p_value #>> '{}');
  if char_length(v_text) > 80 then
    raise exception 'a filter text is at most 80 characters' using errcode = '22023';
  end if;
  return nullif(v_text, '');
end
$$;

-- A whole number between p_min and p_max, or null.
create function private.filter_int(p_value jsonb, p_min integer, p_max integer) returns integer
language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') !~ '^\d+$' or (p_value #>> '{}')::numeric not between p_min and p_max then
    raise exception 'a filter number must be between % and %', p_min, p_max using errcode = '22023';
  end if;
  return (p_value #>> '{}')::integer;
end
$$;

-- A number answer's limit, in the range profile_values allows, or null.
create function private.filter_num(p_value jsonb) returns numeric
language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between -1e15 and 1e15 then
    raise exception 'a filter number is out of range' using errcode = '22023';
  end if;
  return (p_value #>> '{}')::numeric;
end
$$;

-- 'YYYY-MM-DD', or null.
create function private.filter_date(p_value jsonb) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' or (p_value #>> '{}') = '' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'a filter date is YYYY-MM-DD' using errcode = '22023';
  end if;
  return (p_value #>> '{}')::date;
end
$$;

-- The community's choices of one list among the given ids, in list order; null when none is known.
create function private.filter_choices(p_community uuid, p_list text, p_ids jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_ids is null or jsonb_typeof(p_ids) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_ids) <> 'array' or jsonb_array_length(p_ids) > 200 then
    raise exception 'a filter list holds at most 200 ids' using errcode = '22023';
  end if;
  return (
    select jsonb_agg(o.id order by o.position, o.id)
    from public.community_options o
    where o.community_id = p_community and o.list = p_list
      and o.id::text in (select jsonb_array_elements_text(p_ids))
  );
end
$$;

-- One searchable field's condition, by its kind: {text} | {yes} | {options} | {min, max} | {from, to}.
-- Null when it asks for nothing.
create function private.filter_field(p_field public.profile_fields, p_cond jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cond jsonb;
begin
  if jsonb_typeof(p_cond) is distinct from 'object' then
    raise exception 'a field filter is an object' using errcode = '22023';
  end if;
  case p_field.kind
    when 'short_text', 'long_text' then
      v_cond := jsonb_build_object('text', private.filter_text(p_cond -> 'text'));
    when 'yes_no' then
      if jsonb_typeof(p_cond -> 'yes') not in ('boolean', 'null') then
        raise exception 'a yes/no filter is true or false' using errcode = '22023';
      end if;
      v_cond := jsonb_build_object('yes', p_cond -> 'yes');
    when 'pick_one', 'pick_several' then
      if jsonb_typeof(p_cond -> 'options') not in ('array', 'null')
        or (jsonb_typeof(p_cond -> 'options') = 'array' and jsonb_array_length(p_cond -> 'options') > 200) then
        raise exception 'a choice filter holds at most 200 ids' using errcode = '22023';
      end if;
      v_cond := jsonb_build_object('options', (
        select jsonb_agg(o.id order by o.position, o.id)
        from public.profile_field_options o
        where o.field_id = p_field.id
          and o.id::text in (select jsonb_array_elements_text(case when jsonb_typeof(p_cond -> 'options') = 'array' then p_cond -> 'options' end))
      ));
    when 'number' then
      v_cond := jsonb_build_object('min', private.filter_num(p_cond -> 'min'), 'max', private.filter_num(p_cond -> 'max'));
    when 'date' then
      v_cond := jsonb_build_object('from', private.filter_date(p_cond -> 'from'), 'to', private.filter_date(p_cond -> 'to'));
    else
      v_cond := '{}';
  end case;
  return nullif(jsonb_strip_nulls(v_cond), '{}');
end
$$;

-- G1 "Show profiles": saves the filter on your account. p_filter: {text, statuses, looking_for,
-- districts, place, age_min, age_max, score_min, stars_min, stars_max, fields: {field id: condition}}.
-- Unknown ids, and fields that are retired or no longer searchable, are dropped; bad values refused.
create function public.save_search_filter(p_community uuid, p_filter jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
  v_given jsonb := case when jsonb_typeof(p_filter -> 'fields') = 'object' then p_filter -> 'fields' else '{}' end;
  v_fields jsonb := '{}';
  v_field public.profile_fields;
  v_key text;
  v_cond jsonb;
begin
  if v_member.state <> 'approved' then
    raise exception 'only members search profiles' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filter) is distinct from 'object' then
    raise exception 'a filter is an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_filter -> 'fields') not in ('object', 'null') or (select count(*) from jsonb_object_keys(v_given)) > 100 then
    raise exception 'fields: at most 100 field filters' using errcode = '22023';
  end if;

  for v_key, v_cond in select e.key, e.value from jsonb_each(v_given) as e loop
    continue when v_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    select * into v_field from public.profile_fields
    where id = v_key::uuid and community_id = p_community and searchable and active;
    continue when not found;
    v_cond := private.filter_field(v_field, v_cond);
    if v_cond is not null then
      v_fields := v_fields || jsonb_build_object(v_key, v_cond);
    end if;
  end loop;

  update public.members
  set search_filter = jsonb_strip_nulls(jsonb_build_object(
    'text', private.filter_text(p_filter -> 'text'),
    'statuses', private.filter_choices(p_community, 'status', p_filter -> 'statuses'),
    'looking_for', private.filter_choices(p_community, 'status', p_filter -> 'looking_for'),
    'districts', private.filter_choices(p_community, 'district', p_filter -> 'districts'),
    'place', private.filter_text(p_filter -> 'place'),
    'age_min', private.filter_int(p_filter -> 'age_min', 0, 150),
    'age_max', private.filter_int(p_filter -> 'age_max', 0, 150),
    'score_min', private.filter_int(p_filter -> 'score_min', 0, 100),
    'stars_min', private.filter_int(p_filter -> 'stars_min', 0, 5),
    'stars_max', private.filter_int(p_filter -> 'stars_max', 0, 5),
    'fields', nullif(v_fields, '{}')
  ))
  where community_id = p_community and user_id = v_member.user_id;
end
$$;

-- Your saved filter, for the filter screen and the filter badge. Null outside the community.
create function public.search_filter(p_community uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select search_filter from public.members
  where community_id = p_community and user_id = (select auth.uid()) and state = 'approved'
$$;

-- ---------------------------------------------------------------------------------------------
-- A5 Profiles list and A27 swipe: one page of approved members visible in search, minus yourself
-- and blocks either way, through your saved filter, best score first (keyset on score, user).
-- - Age becomes a birth-date range; a couple matches when either person is in it (§6.6).
-- - Text matches the username, Place, a District's name or a searchable text answer.
-- - A builder field filter needs a matching answer in a section the member's Status has. That
--   check is written out where it is used: a helper function would run once per row.
-- - A basic field the community switched off is not filtered on.
-- - stars: your own note's stars (null = not rated, which filters as 0).
create function public.search_profiles(p_community uuid, p_limit integer default 30, p_after_score smallint default null, p_after_user uuid default null)
returns table (
  user_id uuid, username text, status_id uuid, country_id uuid, district_id uuid, place text, ages integer[], score smallint,
  looking_for uuid[], photo_thumb text, photo_taken_in_app boolean, stars smallint
)
language sql stable security definer set search_path = '' as $$
  with f as materialized (
    select v.user_id as viewer, c.show_visibility, c.show_district, c.show_place,
      private.like_pattern(v.search_filter ->> 'text') as text,
      array(select x::uuid from jsonb_array_elements_text(v.search_filter -> 'statuses') as x) as statuses,
      case when c.show_looking_for then array(select x::uuid from jsonb_array_elements_text(v.search_filter -> 'looking_for') as x) else '{}' end as looking_for,
      case when c.show_district then array(select x::uuid from jsonb_array_elements_text(v.search_filter -> 'districts') as x) else '{}' end as districts,
      case when c.show_place then private.like_pattern(v.search_filter ->> 'place') end as place,
      -- age >= min: born on or before today minus min years; age <= max: born after today minus max + 1.
      case when c.show_age then (current_date - make_interval(years => (v.search_filter ->> 'age_min')::integer))::date end as born_by,
      case when c.show_age then (current_date - make_interval(years => (v.search_filter ->> 'age_max')::integer + 1))::date end as born_after,
      case when c.show_score then (v.search_filter ->> 'score_min')::smallint end as score_min,
      (v.search_filter ->> 'stars_min')::smallint as stars_min,
      (v.search_filter ->> 'stars_max')::smallint as stars_max
    from public.members v
    join public.communities c on c.id = v.community_id
    where v.community_id = p_community and v.user_id = (select auth.uid()) and v.state = 'approved'
  ),
  -- Districts whose name contains the text, in any language.
  text_districts as materialized (
    select o.id
    from f join public.community_options o on o.community_id = p_community and o.list = 'district'
    where f.text is not null and f.show_district
      and exists (select 1 from jsonb_each_text(o.label) as l where lower(l.value) like f.text)
  ),
  text_fields as materialized (
    select k.id, k.for_statuses, k.for_substatuses
    from f join public.profile_fields k on k.community_id = p_community
    where f.text is not null and k.searchable and k.active and k.kind in ('short_text', 'long_text')
  ),
  conds as materialized (
    select k.id, k.kind, k.for_statuses, k.for_substatuses,
      private.like_pattern(e.value ->> 'text') as text,
      (e.value ->> 'yes')::boolean as yes,
      array(select x::uuid from jsonb_array_elements_text(e.value -> 'options') as x) as options,
      (e.value ->> 'min')::numeric as num_min, (e.value ->> 'max')::numeric as num_max,
      (e.value ->> 'from')::date as date_from, (e.value ->> 'to')::date as date_to
    from public.members v
    cross join lateral jsonb_each(v.search_filter -> 'fields') as e
    join public.profile_fields k on k.community_id = p_community and k.id = e.key::uuid and k.searchable and k.active
    where v.community_id = p_community and v.user_id = (select auth.uid())
  )
  select m.user_id, m.username, m.status_id, m.country_id, m.district_id, m.place,
    array(
      select extract(year from age(current_date, pp.birth_date))::integer
      from private.status_people(m.status_id) as s
      join public.profile_people pp
        on pp.community_id = m.community_id and pp.user_id = m.user_id
        and pp.substatus_id is not distinct from s.substatus_id and pp.n = s.n
      order by s.k
    ),
    m.score, m.looking_for, p.thumb_path, p.taken_in_app, n.stars
  from public.members m
  cross join f
  left join public.notes n on n.community_id = p_community and n.author_id = f.viewer and n.subject_id = m.user_id
  left join public.photos p on p.id = m.photo_id
  where m.community_id = p_community and m.state = 'approved' and not m.is_system and m.user_id <> f.viewer
    and (m.visible_in_search or not f.show_visibility)
    and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocker_id = f.viewer and b.blocked_id = m.user_id)
    and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocked_id = f.viewer and b.blocker_id = m.user_id)
    and (cardinality(f.statuses) = 0 or m.status_id = any(f.statuses))
    and (cardinality(f.looking_for) = 0 or m.looking_for && f.looking_for)
    and (cardinality(f.districts) = 0 or m.district_id = any(f.districts))
    and (f.place is null or lower(m.place) like f.place)
    and (f.score_min is null or m.score >= f.score_min)
    and (f.stars_min is null or coalesce(n.stars, 0) >= f.stars_min)
    and (f.stars_max is null or coalesce(n.stars, 0) <= f.stars_max)
    and (f.born_by is null and f.born_after is null or exists (
      select 1 from public.profile_people pp
      where pp.community_id = p_community and pp.user_id = m.user_id
        and (f.born_by is null or pp.birth_date <= f.born_by)
        and (f.born_after is null or pp.birth_date > f.born_after)
        -- a person of the member's current Status (an admin may have changed it since)
        and case when pp.substatus_id is null then not exists (select 1 from public.status_slots s where s.status_id = m.status_id)
          else exists (select 1 from public.status_slots s where s.status_id = m.status_id and s.substatus_id = pp.substatus_id and pp.n <= s.count) end
    ))
    and (f.text is null
      or lower(m.username) like f.text
      or (f.show_place and lower(m.place) like f.text)
      or m.district_id in (select id from text_districts)
      or exists (
        select 1 from text_fields k
        join public.profile_values pv on pv.field_id = k.id and pv.user_id = m.user_id
        where lower(pv.value_text) like f.text
          and (k.for_statuses is null or m.status_id = any(k.for_statuses))
          and case when pv.substatus_id is null then k.for_substatuses is null
            else pv.substatus_id = any(k.for_substatuses)
              and exists (select 1 from public.status_slots s where s.status_id = m.status_id and s.substatus_id = pv.substatus_id and pv.n <= s.count) end
      ))
    -- every field filter has a matching answer
    and not exists (
      select 1 from conds k
      where not (
        (k.for_statuses is null or m.status_id = any(k.for_statuses))
        and case when k.kind in ('pick_one', 'pick_several') then exists (
            select 1 from public.profile_value_options pvo
            where pvo.field_id = k.id and pvo.user_id = m.user_id and pvo.option_id = any(k.options)
              and case when pvo.substatus_id is null then k.for_substatuses is null
                else pvo.substatus_id = any(k.for_substatuses)
                  and exists (select 1 from public.status_slots s where s.status_id = m.status_id and s.substatus_id = pvo.substatus_id and pvo.n <= s.count) end
          )
          else exists (
            select 1 from public.profile_values pv
            where pv.field_id = k.id and pv.user_id = m.user_id
              and (k.text is null or lower(pv.value_text) like k.text)
              and (k.yes is null or pv.value_bool = k.yes)
              and (k.num_min is null or pv.value_num >= k.num_min)
              and (k.num_max is null or pv.value_num <= k.num_max)
              and (k.date_from is null or pv.value_date >= k.date_from)
              and (k.date_to is null or pv.value_date <= k.date_to)
              and case when pv.substatus_id is null then k.for_substatuses is null
                else pv.substatus_id = any(k.for_substatuses)
                  and exists (select 1 from public.status_slots s where s.status_id = m.status_id and s.substatus_id = pv.substatus_id and pv.n <= s.count) end
          ) end
      )
    )
    and (p_after_score is null or (m.score, m.user_id) < (p_after_score, p_after_user))
  order by m.score desc, m.user_id desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- ---------------------------------------------------------------------------------------------
-- A2 "Find new user/group" (§6.16): names containing the typed text (2 characters or more), only
-- people you have no DM with and groups you are not in. People: approved, visible in search, no
-- block either way (Q4: hidden profiles stay hidden here too). Groups: visible in search. The
-- matches come from the trigram indexes first, then the rules are checked (like member_names).

-- "Find new group" by any part of its name.
create index chats_group_name_trgm on public.chats using gin (lower(name) extensions.gin_trgm_ops) where kind = 'group';

create function public.find_new(p_community uuid, p_query text, p_users boolean default true, p_groups boolean default true, p_limit integer default 30)
returns table (kind text, id uuid, name text, status_id uuid, district_id uuid, place text, headline text, icon text)
language sql stable security definer set search_path = '' as $$
  with q as materialized (
    select v.user_id as viewer, c.show_visibility
    from public.members v
    join public.communities c on c.id = v.community_id
    where v.community_id = p_community and v.user_id = (select auth.uid()) and v.state = 'approved'
      and char_length(btrim(p_query)) between 2 and 80
  ),
  people as materialized (
    select m.user_id, m.username, m.status_id, m.district_id, m.place, m.photo_id, m.state, m.is_system, m.visible_in_search
    from public.members m
    where p_users and exists (select 1 from q)
      and m.community_id = p_community
      and lower(m.username) like private.like_pattern(p_query)
  ),
  groups as materialized (
    select g.id, g.name, g.headline, g.visible_in_search
    from public.chats g
    where p_groups and exists (select 1 from q)
      and g.community_id = p_community and g.kind = 'group'
      and lower(g.name) like private.like_pattern(p_query)
  )
  select found.kind, found.id, found.name, found.status_id, found.district_id, found.place, found.headline, found.icon
  from (
    select 'user' as kind, u.user_id as id, u.username as name, u.status_id, u.district_id, u.place, null::text as headline, p.thumb_path as icon
    from q cross join people u
    left join public.photos p on p.id = u.photo_id
    where u.state = 'approved' and not u.is_system and u.user_id <> q.viewer
      and (u.visible_in_search or not q.show_visibility)
      and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocker_id = q.viewer and b.blocked_id = u.user_id)
      and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocked_id = q.viewer and b.blocker_id = u.user_id)
      and not exists (
        select 1 from public.chats d
        where d.community_id = p_community and d.kind = 'dm'
          and d.dm_user_a = least(q.viewer, u.user_id) and d.dm_user_b = greatest(q.viewer, u.user_id)
      )
    union all
    select 'group', g.id, g.name, null, null, null, g.headline, null
    from q cross join groups g
    where g.visible_in_search
      and not exists (select 1 from public.chat_members cm where cm.chat_id = g.id and cm.user_id = q.viewer)
  ) as found
  order by lower(found.name), found.id
  limit least(greatest(p_limit, 1), 50)
$$;

-- ---------------------------------------------------------------------------------------------
-- Replaced: profile_cards by search_profiles, group_directory by find_new.

drop function public.profile_cards(uuid, integer, smallint, uuid);
drop function public.group_directory(uuid, integer);

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.like_pattern(text), private.filter_text(jsonb), private.filter_int(jsonb, integer, integer),
  private.filter_num(jsonb), private.filter_date(jsonb), private.filter_choices(uuid, text, jsonb),
  private.filter_field(public.profile_fields, jsonb)
from public, anon, authenticated;

revoke execute on function
  public.set_note(uuid, uuid, jsonb), public.save_search_filter(uuid, jsonb), public.search_filter(uuid),
  public.search_profiles(uuid, integer, smallint, uuid), public.find_new(uuid, text, boolean, boolean, integer)
from public, anon;
grant execute on function
  public.set_note(uuid, uuid, jsonb), public.save_search_filter(uuid, jsonb), public.search_filter(uuid),
  public.search_profiles(uuid, integer, smallint, uuid), public.find_new(uuid, text, boolean, boolean, integer)
to authenticated;
