-- Step 9 follow-up: the answers of fields the admin marks "Shown on card" (on_card) are on the
-- Profiles list cards (A5). search_profiles gains one column, answers, built for the page's rows only,
-- in the profile order and with the same section rules as profile(). Changing the result means drop
-- and create: only the step 9 code calls search_profiles (the deployed build still uses
-- profile_cards), so nothing live breaks. Same filter, paging and order as 20261025130000_search_speed.sql.

drop function public.search_profiles(uuid, integer, smallint, uuid);

create function public.search_profiles(p_community uuid, p_limit integer default 30, p_after_score smallint default null, p_after_user uuid default null)
returns table (
  user_id uuid, username text, status_id uuid, country_id uuid, district_id uuid, place text, ages integer[], score smallint,
  looking_for uuid[], photo_thumb text, photo_taken_in_app boolean, stars smallint, answers jsonb
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
  -- People in a block with you, either way: checked as one hashed set, whatever the planner expects.
  hidden as materialized (
    select b.blocked_id as id from f join public.blocks b on b.community_id = p_community and b.blocker_id = f.viewer
    union all
    select b.blocker_id from f join public.blocks b on b.community_id = p_community and b.blocked_id = f.viewer
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
  ),
  -- The page first (ids only); the card's photo, stars and ages are added for its rows.
  page as materialized (
    select m.user_id, m.score
    from public.members m
    cross join f
    where m.community_id = p_community and m.state = 'approved' and not m.is_system and m.user_id <> f.viewer
      and (m.visible_in_search or not f.show_visibility)
      and m.user_id not in (select id from hidden)
      and (cardinality(f.statuses) = 0 or m.status_id = any(f.statuses))
      and (cardinality(f.looking_for) = 0 or m.looking_for && f.looking_for)
      and (cardinality(f.districts) = 0 or m.district_id = any(f.districts))
      and (f.place is null or lower(m.place) like f.place)
      and (f.score_min is null or m.score >= f.score_min)
      and (f.stars_min is null and f.stars_max is null or coalesce((
        select n.stars from public.notes n where n.community_id = p_community and n.author_id = f.viewer and n.subject_id = m.user_id
      ), 0) between coalesce(f.stars_min, 0) and coalesce(f.stars_max, 5))
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
  )
  select m.user_id, m.username, m.status_id, m.country_id, m.district_id, m.place,
    array(
      select extract(year from age(current_date, pp.birth_date))::integer
      from private.status_people(m.status_id) as s
      join public.profile_people pp
        on pp.community_id = p_community and pp.user_id = m.user_id
        and pp.substatus_id is not distinct from s.substatus_id and pp.n = s.n
      order by s.k
    ),
    m.score, m.looking_for, p.thumb_path, p.taken_in_app, n.stars,
    -- The answers of the fields marked "Shown on card", in the profile order: {f: field, k: kind, v: [...]}.
    -- Pick one/several: option ids, yes/no: booleans, the rest as text. Photo fields stay off the card.
    (
      select jsonb_agg(jsonb_build_object('f', a.field_id, 'k', a.kind, 'v', a.vals) order by a.position, a.field_id)
      from (
        select k.id as field_id, k.kind, k.position, jsonb_agg(v.val order by v.substatus_id nulls first, v.n, v.position) as vals
        from public.profile_fields k
        cross join lateral (
          select pv.substatus_id, pv.n, 0 as position,
            case when pv.value_bool is not null then to_jsonb(pv.value_bool) else to_jsonb(coalesce(pv.value_text, pv.value_num::text, pv.value_date::text)) end as val
          from public.profile_values pv
          where pv.field_id = k.id and pv.user_id = m.user_id and pv.value_photo_id is null
          union all
          select pvo.substatus_id, pvo.n, o.position, to_jsonb(pvo.option_id)
          from public.profile_value_options pvo
          join public.profile_field_options o on o.id = pvo.option_id
          where pvo.field_id = k.id and pvo.user_id = m.user_id
        ) as v
        where k.community_id = p_community and k.on_card and k.kind <> 'photo'
          and private.field_applies(k, m.status_id, v.substatus_id, v.n)
        group by k.id, k.kind, k.position
      ) as a
    )
  from page g
  join public.members m on m.community_id = p_community and m.user_id = g.user_id
  left join public.notes n on n.community_id = p_community and n.author_id = (select auth.uid()) and n.subject_id = m.user_id
  left join public.photos p on p.id = m.photo_id
  order by g.score desc, g.user_id desc
$$;

revoke execute on function public.search_profiles(uuid, integer, smallint, uuid) from public, anon;
grant execute on function public.search_profiles(uuid, integer, smallint, uuid) to authenticated;
