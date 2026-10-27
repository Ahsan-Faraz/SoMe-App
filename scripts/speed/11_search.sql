-- Step 9 speed check: search_profiles through the saved filter, find_new and set_note, rolled back
-- at the end. 5,000 members across 3 Statuses, a birth date per person, 4 searchable builder
-- fields answered by everyone, 1,000 of the viewer's notes, 400 blocks around the viewer and 200
-- groups. Timed as the viewer (best of 5). Target: search and Find new under 50 ms (§11).
-- Run: npx supabase db query --linked -f scripts/speed/11_search.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking;
grant select on seed to authenticated;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('75000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.option(p_list text, p_label text) returns uuid language sql stable as $$
  select o.id from public.community_options o join seed on o.community_id = seed.biking where o.list = p_list and o.label ->> 'en' = p_label
$$;
create function pg_temp.field(p_key text) returns uuid language sql stable as $$
  select f.id from public.profile_fields f join seed on f.community_id = seed.biking where f.key = p_key
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed9-' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed9 ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 5000) as n;

-- Statuses in thirds; 21 districts; a place on a tenth; looking for one Status.
create temp table statuses as select array[pg_temp.option('status', 'Man'), pg_temp.option('status', 'Woman'), pg_temp.option('status', 'Couple MF')] as ids;
create temp table districts as select array(select o.id from public.community_options o join seed on o.community_id = seed.biking where o.list = 'district' order by o.position) as ids;
update public.members m set state = 'approved', visible_in_search = (n % 50 <> 0), score = (hashtext(m.user_id::text) & 100),
  status_id = s.ids[1 + n % 3], looking_for = array[s.ids[1 + (n / 3) % 3]],
  district_id = d.ids[1 + n % cardinality(d.ids)], place = case when n % 10 = 0 then 'Test Place ' || (n % 97) end
from statuses s, districts d, (select generate_series(1, 5000) as n) as g
where m.user_id = pg_temp.u(g.n);

-- A birth date for each person of the Status: 18 to 70 years old.
insert into public.profile_people (community_id, user_id, substatus_id, n, birth_date)
select seed.biking, pg_temp.u(g.n), sl.substatus_id, k, current_date - ((18 + (g.n * 7 + k * 13) % 52) * 365 + g.n % 365)
from seed cross join statuses s cross join generate_series(1, 5000) as g (n)
join public.status_slots sl on sl.status_id = s.ids[1 + g.n % 3]
cross join generate_series(1, sl.count) as k;

-- Four searchable fields (text, pick one, number, yes/no), answered by everyone.
insert into public.profile_fields (community_id, key, label, kind, searchable, position)
select biking, f.key, jsonb_build_object('en', f.key), f.kind, true, 960 + f.n from seed cross join lateral (values
  ('speed_motto', 'short_text', 1), ('speed_bike', 'pick_one', 2), ('speed_rides', 'number', 3), ('speed_own', 'yes_no', 4)
) as f (key, kind, n);
insert into public.profile_field_options (community_id, field_id, label, position)
select biking, pg_temp.field('speed_bike'), jsonb_build_object('en', 'Test bike ' || k), k from seed, generate_series(0, 9) as k;
insert into public.profile_values (community_id, user_id, field_id, value_text, value_num, value_bool)
select seed.biking, pg_temp.u(n), pg_temp.field('speed_motto'), 'Test motto ' || md5(n::text), null::numeric, null::boolean from seed, generate_series(1, 5000) as n
union all select seed.biking, pg_temp.u(n), pg_temp.field('speed_rides'), null, n % 40, null from seed, generate_series(1, 5000) as n
union all select seed.biking, pg_temp.u(n), pg_temp.field('speed_own'), null, null, n % 2 = 0 from seed, generate_series(1, 5000) as n;
insert into public.profile_value_options (community_id, user_id, field_id, option_id)
select seed.biking, pg_temp.u(n), pg_temp.field('speed_bike'),
  (select o.id from public.profile_field_options o where o.field_id = pg_temp.field('speed_bike') and o.position = n % 10)
from seed, generate_series(1, 5000) as n;

-- The viewer (1): 1,000 notes with stars, blocked 200 and blocked by 200.
insert into public.notes (community_id, author_id, subject_id, stars)
select seed.biking, pg_temp.u(1), pg_temp.u(n), 1 + n % 5 from seed, generate_series(1000, 1999) as n;
insert into public.blocks (community_id, blocker_id, blocked_id)
select seed.biking, pg_temp.u(1), pg_temp.u(n) from seed, generate_series(2, 201) as n
union all select seed.biking, pg_temp.u(n), pg_temp.u(1) from seed, generate_series(202, 401) as n;

-- 200 groups, the viewer in 20 of them.
insert into public.chats (id, community_id, kind, name, headline, created_by)
select ('75000000-0000-4000-8000-1' || lpad(n::text, 11, '0'))::uuid, seed.biking, 'group', 'Test speed9 group ' || n, 'Test', pg_temp.u(2) from seed, generate_series(1, 200) as n;
insert into public.chat_members (chat_id, community_id, user_id)
select ('75000000-0000-4000-8000-1' || lpad(n::text, 11, '0'))::uuid, seed.biking, pg_temp.u(1) from seed, generate_series(1, 20) as n;

analyze public.members, public.profile_people, public.profile_values, public.profile_value_options, public.notes, public.blocks, public.chats;
-- Fresh rows wait in the trigram indexes' pending lists until autovacuum merges them; merge them here.
select gin_clean_pending_list('public.members_username_trgm');
select gin_clean_pending_list('public.chats_group_name_trgm');

create function pg_temp.time(p_name text, p_sql text, p_target numeric) returns void language plpgsql as $$
declare
  v_plan json;
  v_best numeric;
  v_ms numeric;
begin
  for i in 1..5 loop
    execute 'explain (analyze, format json) ' || p_sql into v_plan;
    v_ms := (v_plan -> 0 ->> 'Execution Time')::numeric;
    v_best := least(coalesce(v_best, v_ms), v_ms);
  end loop;
  insert into pg_temp.speed values (p_name, round(v_best, 2), p_target);
end
$$;
-- Saves the viewer's filter, then times one page of search_profiles through it.
create function pg_temp.search(p_name text, p_filter jsonb, p_after text default 'null, null') returns void language plpgsql as $$
begin
  perform public.save_search_filter((select biking from seed), p_filter);
  perform pg_temp.time(p_name, format('select * from public.search_profiles(%L, 30, %s)', (select biking from seed), p_after), 50);
end
$$;
grant execute on function pg_temp.time(text, text, numeric), pg_temp.search(text, jsonb, text), pg_temp.u(integer), pg_temp.option(text, text), pg_temp.field(text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);

select pg_temp.search('search: no filter, first 30', '{}');
select pg_temp.search('search: no filter, a page deep in the list', '{}', '10::smallint, ''75000000-0000-4000-8000-000000002500''::uuid');
select pg_temp.search('search: Status + Looking for + District', jsonb_build_object(
  'statuses', jsonb_build_array(pg_temp.option('status', 'Couple MF')), 'looking_for', jsonb_build_array(pg_temp.option('status', 'Woman')),
  'districts', jsonb_build_array(pg_temp.option('district', 'Stockholm'), pg_temp.option('district', 'Blekinge'))));
select pg_temp.search('search: age 30-35', '{"age_min": 30, "age_max": 35}');
select pg_temp.search('search: age 69-70 (few match)', '{"age_min": 69, "age_max": 70}');
select pg_temp.search('search: score min 95', '{"score_min": 95}');
select pg_temp.search('search: My stars 4-5', '{"stars_min": 4, "stars_max": 5}');
select pg_temp.search('search: Place text', '{"place": "place 42"}');
select pg_temp.search('search: text, few match (worst: every row)', '{"text": "nobody has this"}');
select pg_temp.search('search: text in a motto', '{"text": "c4ca4238"}');
select pg_temp.search('search: pick one + number + yes/no', jsonb_build_object('fields', jsonb_build_object(
  pg_temp.field('speed_bike'), jsonb_build_object('options', jsonb_build_array((select o.id from public.profile_field_options o where o.field_id = pg_temp.field('speed_bike') and o.position = 3))),
  pg_temp.field('speed_rides'), '{"min": 10, "max": 20}'::jsonb, pg_temp.field('speed_own'), '{"yes": true}'::jsonb)));
select pg_temp.search('search: everything at once', jsonb_build_object(
  'statuses', jsonb_build_array(pg_temp.option('status', 'Man')), 'age_min', 25, 'age_max', 60, 'score_min', 20,
  'fields', jsonb_build_object(pg_temp.field('speed_rides'), '{"min": 5}'::jsonb)));

select pg_temp.time('find_new: "speed9" (extreme: all 5,000 people and 200 groups match)', format('select * from public.find_new(%L, %L)', (select biking from seed), 'speed9'), 50);
select pg_temp.time('find_new: "speed9 4" (1,111 people match, a fifth)', format('select * from public.find_new(%L, %L)', (select biking from seed), 'speed9 4'), 50);
select pg_temp.time('find_new: "speed9 42" (a few match)', format('select * from public.find_new(%L, %L)', (select biking from seed), 'speed9 42'), 50);
select pg_temp.time('find_new: a name nobody has', format('select * from public.find_new(%L, %L)', (select biking from seed), 'kitty'), 50);
select pg_temp.time('find_new: groups only', format('select * from public.find_new(%L, %L, false, true)', (select biking from seed), 'group 1'), 50);
select pg_temp.time('save_search_filter', format('select public.save_search_filter(%L, %L)', (select biking from seed),
  jsonb_build_object('statuses', jsonb_build_array(pg_temp.option('status', 'Man')), 'age_min', 25, 'fields', jsonb_build_object(pg_temp.field('speed_rides'), '{"min": 5}'::jsonb))), 15);
select pg_temp.time('set_note (stars)', format('select public.set_note(%L, %L, %L)', (select biking from seed), pg_temp.u(4000), '{"stars": 4}'), 15);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result from speed;
rollback;
