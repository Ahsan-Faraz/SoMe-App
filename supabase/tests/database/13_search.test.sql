begin;
create extension if not exists pgtap with schema extensions;

select plan(67);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'd0000000-0000-4000-8000-00000000000a'::uuid as anna, -- the viewer, Woman
  'd0000000-0000-4000-8000-00000000000b'::uuid as bert, -- Man, answers every test field
  'd0000000-0000-4000-8000-00000000000c'::uuid as carl, -- Couple MF: The Man 66, The Woman 30
  'd0000000-0000-4000-8000-00000000000d'::uuid as dora, -- Woman, turns 25 tomorrow
  'd0000000-0000-4000-8000-00000000000e'::uuid as eddy, -- Man, turned 25 today
  'd0000000-0000-4000-8000-00000000000f'::uuid as fred, -- hidden from search
  'd0000000-0000-4000-8000-000000000010'::uuid as gina, -- blocked Anna
  'd0000000-0000-4000-8000-000000000011'::uuid as hana, -- applicant
  'd0000000-0000-4000-8000-000000000012'::uuid as ivan; -- community admin
grant select on ids to anon, authenticated;

-- Sign-ups give their consents (step 5b); every community's version is 'test' here.
update public.communities set privacy_version = 'test', show_visibility = true, show_age = true, show_place = true,
  show_district = true, show_looking_for = true, show_score = true;
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values
  (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dora, 'dora'), (ids.eddy, 'eddy'),
  (ids.fred, 'fred'), (ids.gina, 'gina'), (ids.hana, 'hana'), (ids.ivan, 'ivan')
) as u (id, name);

create function pg_temp.option(p_list text, p_label text) returns uuid language sql stable as $$
  select o.id from public.community_options o join ids on o.community_id = ids.biking
  where o.list = p_list and o.label ->> 'en' = p_label
$$;
create function pg_temp.field(p_key text) returns uuid language sql stable as $$
  select f.id from public.profile_fields f join ids on f.community_id = ids.biking where f.key = p_key
$$;
create function pg_temp.choice(p_key text, p_label text) returns uuid language sql stable as $$
  select o.id from public.profile_field_options o where o.field_id = pg_temp.field(p_key) and o.label ->> 'en' = p_label
$$;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
-- The fixture members Anna's search returns, in its order (live members are left out).
create function pg_temp.found(p_limit integer default 100) returns text[] language sql as $$
  select coalesce(array_agg(replace(s.username, 'Test ', '') order by s.score desc, s.user_id desc), '{}')
  from public.search_profiles((select biking from ids), p_limit) as s
  where s.user_id::text like 'd0000000-%'
$$;
-- Every page in turn, p_size at a time (keyset on score, user): the fixture members met on the way.
create function pg_temp.paged(p_size integer) returns text[] language plpgsql as $$
declare
  v_out text[] := '{}';
  v_score smallint;
  v_user uuid;
  v_rows integer;
  r record;
begin
  loop
    v_rows := 0;
    for r in select s.user_id, s.username, s.score from public.search_profiles((select biking from ids), p_size, v_score, v_user) as s loop
      v_rows := v_rows + 1;
      if r.user_id::text like 'd0000000-%' then
        v_out := v_out || replace(r.username, 'Test ', '');
      end if;
      v_score := r.score;
      v_user := r.user_id;
    end loop;
    exit when v_rows < p_size;
  end loop;
  return v_out;
end
$$;
-- Anna saves a filter, then searches.
create function pg_temp.search(p_filter jsonb) returns text[] language sql as $$
  select public.save_search_filter((select biking from ids), p_filter);
  select pg_temp.found();
$$;
-- The fixture fields' answers on a card in Anna's search (the live project's own fields are left out).
create function pg_temp.card(p_user uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(e.a order by e.n), '[]')
  from public.search_profiles((select biking from ids)) as s
  cross join lateral jsonb_array_elements(coalesce(s.answers, '[]')) with ordinality as e (a, n)
  where s.user_id = p_user and (e.a ->> 'f')::uuid in (select f.id from public.profile_fields f join ids on f.community_id = ids.biking where f.key like 'fixture\_%')
$$;
grant execute on function pg_temp.option(text, text), pg_temp.field(text), pg_temp.choice(text, text), pg_temp.as_user(uuid),
  pg_temp.found(integer), pg_temp.paged(integer), pg_temp.search(jsonb), pg_temp.card(uuid) to anon, authenticated;

update public.members m set state = 'approved', visible_in_search = u.visible, status_id = pg_temp.option('status', u.status),
  score = u.score, district_id = pg_temp.option('district', u.district), place = u.place,
  looking_for = case when u.looking is null then '{}' else array[pg_temp.option('status', u.looking)] end
from ids cross join lateral (values
  (ids.anna, true, 'Woman', 10, 'Blekinge', null, null),
  (ids.bert, true, 'Man', 50, 'Stockholm', 'Test Söder', 'Woman'),
  (ids.carl, true, 'Couple MF', 40, 'Blekinge', 'Test Lund', 'Woman'),
  (ids.dora, true, 'Woman', 30, 'Blekinge', null, null),
  (ids.eddy, true, 'Man', 20, 'Blekinge', null, null),
  (ids.fred, false, 'Man', 90, 'Stockholm', null, null),
  (ids.gina, true, 'Woman', 90, 'Stockholm', null, null),
  (ids.ivan, true, 'Man', 5, 'Blekinge', null, null)
) as u (id, visible, status, score, district, place, looking)
where m.user_id = u.id;
update public.members set state = 'applied' where user_id = (select hana from ids);
update public.members set role = 'admin' where user_id = (select ivan from ids);
insert into public.blocks (community_id, blocker_id, blocked_id) select biking, gina, anna from ids;

-- Birth dates: around birthdays, and a couple where only one person is in an age range.
insert into public.profile_people (community_id, user_id, substatus_id, n, birth_date)
select ids.biking, p.id, pg_temp.option('substatus', p.sub), 1, p.born
from ids cross join lateral (values
  (ids.bert, 'The Man', date '1990-06-15'),
  (ids.carl, 'The Man', date '1960-01-01'),
  (ids.carl, 'The Woman', (current_date - interval '30 years')::date),
  (ids.dora, 'The Woman', (current_date + interval '1 day' - interval '25 years')::date),
  (ids.eddy, 'The Man', (current_date - interval '25 years')::date)
) as p (id, sub, born);

-- Searchable test fields of every kind (main section), and one that is not searchable.
insert into public.profile_fields (community_id, key, label, kind, searchable, position)
select biking, f.key, jsonb_build_object('en', f.key), f.kind, f.searchable, 950 + f.n
from ids cross join lateral (values
  ('fixture_motto', 'short_text', true, 1), ('fixture_bike', 'pick_one', true, 2), ('fixture_rides', 'number', true, 3),
  ('fixture_own', 'yes_no', true, 4), ('fixture_since', 'date', true, 5), ('fixture_secret', 'short_text', false, 6)
) as f (key, kind, searchable, n);
insert into public.profile_field_options (community_id, field_id, label, position)
select biking, pg_temp.field('fixture_bike'), jsonb_build_object('en', o.label), o.n from ids cross join lateral (values ('Test Gravel', 0), ('Test Road', 1)) as o (label, n);

insert into public.profile_values (community_id, user_id, field_id, value_text, value_num, value_bool, value_date)
select ids.biking, ids.bert, pg_temp.field(v.key), v.t, v.num, v.yes, v.d
from ids cross join lateral (values
  ('fixture_motto', 'Test Love hills', null::numeric, null::boolean, null::date),
  ('fixture_rides', null, 12, null, null),
  ('fixture_own', null, null, true, null),
  ('fixture_since', null, null, null, date '2015-05-01'),
  ('fixture_secret', 'Test hidden words', null, null, null)
) as v (key, t, num, yes, d);
insert into public.profile_values (community_id, user_id, field_id, value_num, value_bool)
select biking, carl, pg_temp.field('fixture_rides'), 30, null from ids
union all select biking, carl, pg_temp.field('fixture_own'), null, false from ids;
insert into public.profile_value_options (community_id, user_id, field_id, option_id)
select biking, bert, pg_temp.field('fixture_bike'), pg_temp.choice('fixture_bike', 'Test Gravel') from ids
union all select biking, carl, pg_temp.field('fixture_bike'), pg_temp.choice('fixture_bike', 'Test Road') from ids;

-- Groups for "Find new group": one open, one Anna is in, one hidden.
insert into public.chats (id, community_id, kind, name, headline, visible_in_search, created_by)
select g.id, ids.biking, 'group', g.name, 'Test headline', g.visible, ids.ivan
from ids cross join lateral (values
  ('d0000000-0000-4000-8000-0000000000a1'::uuid, 'Test Hill Climbers', true),
  ('d0000000-0000-4000-8000-0000000000a2'::uuid, 'Test Hill Walkers', true),
  ('d0000000-0000-4000-8000-0000000000a3'::uuid, 'Test Hill Secret', false)
) as g (id, name, visible);
insert into public.chat_members (chat_id, community_id, user_id) select 'd0000000-0000-4000-8000-0000000000a2', biking, anna from ids;

-- Schema ---------------------------------------------------------------------------------------
select has_table('public', 'notes', 'notes table exists');
select is((select relrowsecurity from pg_class where oid = 'public.notes'::regclass), true, 'notes has RLS on');

set local role anon;
select throws_ok($$ select * from public.search_profiles((select biking from ids)) $$, '42501', null, 'anon cannot search');
select throws_ok($$ select * from public.find_new((select biking from ids), 'Test') $$, '42501', null, 'anon cannot use Find new');
select throws_ok($$ select public.set_note(biking, bert, '{"stars": 3}') from ids $$, '42501', null, 'anon cannot keep notes');
reset role;

-- Anna, no filter ------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select is(pg_temp.search('{}'), array['bert', 'carl', 'dora', 'eddy', 'ivan'],
  'no filter: approved members visible in search, best score first; never yourself, hidden, blocked or applicants');
select is(
  (select ages from public.search_profiles((select biking from ids)) where user_id = (select carl from ids)),
  array[(extract(year from age(current_date, date '1960-01-01')))::int, 30],
  'a card has the age of each person, in the Status''s order'
);
select is((select count(*)::int from public.search_profiles((select biking from ids)) where user_id = '00000000-0000-4000-8000-000000000001'), 0,
  'the No-reply account is never listed');

-- Paging: keyset on (score, user), no duplicates.
select is(pg_temp.paged(2), array['bert', 'carl', 'dora', 'eddy', 'ivan'], 'paging 2 at a time: the same order, nobody twice or missed');
select is(pg_temp.paged(1), array['bert', 'carl', 'dora', 'eddy', 'ivan'], 'paging 1 at a time');

-- Built-in filters -----------------------------------------------------------------------------
select is(pg_temp.search(jsonb_build_object('statuses', jsonb_build_array(pg_temp.option('status', 'Man')))), array['bert', 'eddy', 'ivan'], 'Status');
select is(
  pg_temp.search(jsonb_build_object(
    'statuses', jsonb_build_array(pg_temp.option('status', 'Man'), pg_temp.option('status', 'Couple MF')),
    'looking_for', jsonb_build_array(pg_temp.option('status', 'Woman')),
    'districts', jsonb_build_array(pg_temp.option('district', 'Stockholm')))),
  array['bert'],
  'three filters combined: Status, Looking for and District'
);
select is(pg_temp.search('{"place": "söder"}'), array['bert'], 'Place contains the text, any case');
select is(pg_temp.search('{"score_min": 30}'), array['bert', 'carl', 'dora'], 'Profile score min');
select is(pg_temp.search('{"age_min": 25, "age_max": 25}'), array['eddy'], 'age 25: turned 25 today is in, turns 25 tomorrow is not');
select is(pg_temp.search('{"age_max": 24}'), array['dora'], 'age max 24: the day before the birthday');
select is(pg_temp.search('{"age_min": 30, "age_max": 30}'), array['carl'], 'a couple matches when either person is in the age range');
select is(pg_temp.search('{"text": "love HILLS"}'), array['bert'], 'text matches a searchable text answer');
select is(pg_temp.search('{"text": "hidden words"}'), '{}'::text[], 'text never matches a field that is not searchable');
select is(pg_temp.search('{"text": "test eddy"}'), array['eddy'], 'text matches the username');
select is(pg_temp.search('{"text": "lund"}'), array['carl'], 'text matches the Place');
select is(pg_temp.search('{"text": "stockholm"}'), array['bert'], 'text matches the District''s name');

-- Builder field filters ------------------------------------------------------------------------
select is(pg_temp.search(jsonb_build_object('fields', jsonb_build_object(pg_temp.field('fixture_bike'), jsonb_build_object('options', jsonb_build_array(pg_temp.choice('fixture_bike', 'Test Gravel')))))),
  array['bert'], 'pick one: any of the chosen choices');
select is(pg_temp.search(jsonb_build_object('fields', jsonb_build_object(pg_temp.field('fixture_rides'), '{"min": 10, "max": 20}'::jsonb))),
  array['bert'], 'number range');
select is(pg_temp.search(jsonb_build_object('fields', jsonb_build_object(pg_temp.field('fixture_own'), '{"yes": false}'::jsonb))),
  array['carl'], 'yes/no');
select is(pg_temp.search(jsonb_build_object('fields', jsonb_build_object(pg_temp.field('fixture_since'), '{"from": "2015-01-01", "to": "2015-12-31"}'::jsonb))),
  array['bert'], 'date range');
select is(pg_temp.search(jsonb_build_object('fields', jsonb_build_object(pg_temp.field('fixture_motto'), '{"text": "hills"}'::jsonb))),
  array['bert'], 'text in one field');
select is(pg_temp.search(jsonb_build_object('fields', jsonb_build_object(
    pg_temp.field('fixture_rides'), '{"min": 10}'::jsonb, pg_temp.field('fixture_own'), '{"yes": true}'::jsonb))),
  array['bert'], 'every field filter must match');

-- Answers on the cards ("Shown on card") -------------------------------------------------------
reset role;
update public.profile_fields set on_card = true
where community_id = (select biking from ids) and key in ('fixture_motto', 'fixture_bike', 'fixture_rides', 'fixture_own', 'fixture_since');
set local role authenticated;
select public.save_search_filter(biking, '{}') from ids;
select is(pg_temp.card((select bert from ids)), jsonb_build_array(
    jsonb_build_object('f', pg_temp.field('fixture_motto'), 'k', 'short_text', 'v', jsonb_build_array('Test Love hills')),
    jsonb_build_object('f', pg_temp.field('fixture_bike'), 'k', 'pick_one', 'v', jsonb_build_array(pg_temp.choice('fixture_bike', 'Test Gravel'))),
    jsonb_build_object('f', pg_temp.field('fixture_rides'), 'k', 'number', 'v', '["12"]'::jsonb),
    jsonb_build_object('f', pg_temp.field('fixture_own'), 'k', 'yes_no', 'v', '[true]'::jsonb),
    jsonb_build_object('f', pg_temp.field('fixture_since'), 'k', 'date', 'v', '["2015-05-01"]'::jsonb)),
  'a card has the "Shown on card" answers in the profile order; a field not marked stays off');
select is(pg_temp.card((select carl from ids)), jsonb_build_array(
    jsonb_build_object('f', pg_temp.field('fixture_bike'), 'k', 'pick_one', 'v', jsonb_build_array(pg_temp.choice('fixture_bike', 'Test Road'))),
    jsonb_build_object('f', pg_temp.field('fixture_rides'), 'k', 'number', 'v', '["30"]'::jsonb),
    jsonb_build_object('f', pg_temp.field('fixture_own'), 'k', 'yes_no', 'v', '[false]'::jsonb)),
  'only the answers the member has');
select is((select answers from public.search_profiles((select biking from ids)) where user_id = (select dora from ids)), null,
  'no answers: nothing on the card');
reset role;
update public.profile_fields set for_statuses = array[pg_temp.option('status', 'Woman')] where id = pg_temp.field('fixture_motto');
update public.profile_fields set active = false where id = pg_temp.field('fixture_since');
set local role authenticated;
select is((select array_agg(a ->> 'k') from jsonb_array_elements(pg_temp.card((select bert from ids))) as a), array['pick_one', 'number', 'yes_no'],
  'a field for other Statuses or a retired field is left off');
reset role;
update public.profile_fields set on_card = false where community_id = (select biking from ids) and key like 'fixture\_%';
set local role authenticated;
select is(pg_temp.card((select bert from ids)), '[]'::jsonb, 'unmarked again: the card has no answers');

-- Saving the filter ----------------------------------------------------------------------------
select lives_ok($$ select public.save_search_filter(biking, jsonb_build_object(
    'text', '  Test  ', 'statuses', jsonb_build_array(gen_random_uuid(), pg_temp.option('status', 'Man')),
    'fields', jsonb_build_object(pg_temp.field('fixture_secret'), '{"text": "x"}'::jsonb, pg_temp.field('fixture_rides'), '{"min": null}'::jsonb))) from ids $$,
  'a filter with unknown ids and a field that is not searchable saves');
select is((select public.search_filter(biking) from ids), jsonb_build_object('text', 'Test', 'statuses', jsonb_build_array(pg_temp.option('status', 'Man'))),
  'it is saved cleaned: trimmed text, known ids only, no empty or unsearchable field filters');
select throws_ok($$ select public.save_search_filter(biking, '{"age_min": "x"}') from ids $$, '22023', null, 'an age that is not a number is refused');
select throws_ok($$ select public.save_search_filter(biking, '{"stars_max": 9}') from ids $$, '22023', null, 'stars above 5 are refused');
select throws_ok($$ select public.save_search_filter(biking, jsonb_build_object('place', repeat('x', 81))) from ids $$, '22023', null, 'a text over 80 characters is refused');
select throws_ok($$ select public.save_search_filter(biking, jsonb_build_object('fields', jsonb_build_object(pg_temp.field('fixture_rides'), '{"min": "a"}'::jsonb))) from ids $$,
  '22023', null, 'a field filter of the wrong kind is refused');
select throws_ok($$ update public.members set search_filter = '{}' where user_id = (select anna from ids) $$, '42501', null, 'the filter can''t be written directly');

-- Notes and My stars ---------------------------------------------------------------------------
select lives_ok($$ select public.set_note(biking, bert, '{"stars": 4}') from ids $$, 'Anna gives Bert 4 stars');
select lives_ok($$ select public.set_note(biking, carl, '{"body": "Test met at the ride", "stars": 2}') from ids $$, 'and Carl 2, with a note');
select lives_ok($$ select public.set_note(biking, carl, '{"stars": 3}') from ids $$, 'changing the stars');
select is((select body from public.notes where subject_id = (select carl from ids)), 'Test met at the ride', 'keeps the note''s text');
select is((select stars from public.search_profiles((select biking from ids)) where user_id = (select bert from ids)), 4::smallint, 'the card has my stars');
select is(pg_temp.search('{"stars_min": 3}'), array['bert', 'carl'], 'My stars min');
select is(pg_temp.search('{"stars_max": 0}'), array['dora', 'eddy', 'ivan'], 'My stars max 0: the ones not rated yet');
select throws_ok($$ select public.set_note(biking, bert, '{"stars": 6}') from ids $$, '22023', null, 'stars are 1 to 5');
select throws_ok($$ select public.set_note(biking, anna, '{"stars": 3}') from ids $$, '22023', null, 'no notes about yourself');
select throws_ok($$ select public.set_note(biking, gina, '{"stars": 3}') from ids $$, '22023', null, 'no notes about someone in a block');
select throws_ok($$ select public.set_note(biking, hana, '{"stars": 3}') from ids $$, '22023', null, 'a member can''t keep notes on an applicant');
select throws_ok($$ insert into public.notes (community_id, author_id, subject_id, stars) select biking, anna, dora, 5 from ids $$, '42501', null, 'notes can''t be written directly');
select lives_ok($$ select public.set_note(biking, bert, '{"stars": null}') from ids $$, 'taking the stars back');
select is((select count(*)::int from public.notes where subject_id = (select bert from ids)), 0, 'an empty note is deleted');

select pg_temp.as_user(ivan) from ids;
select is((select count(*)::int from public.notes where author_id = (select anna from ids)), 0, 'the community admin reads none of Anna''s notes');
select lives_ok($$ select public.set_note(biking, hana, '{"body": "Test applicant"}') from ids $$, 'the community admin keeps notes on an applicant');
select pg_temp.as_user(carl) from ids;
select is((select count(*)::int from public.notes), 0, 'the member a note is about can''t read it');

-- Basic fields switched off -------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select lives_ok($$ select public.save_search_filter(biking, '{"age_min": 30, "age_max": 30, "score_min": 45}') from ids $$, 'Anna filters on age and score');
reset role;
update public.communities set show_age = false, show_score = false where id = (select biking from ids);
set local role authenticated;
select is(pg_temp.found(), array['bert', 'carl', 'dora', 'eddy', 'ivan'], 'age and score switched off by the admin: not filtered on');
reset role;
update public.communities set show_age = true, show_score = true where id = (select biking from ids);
-- The admin changes Carl to Man: The Woman's birth date stays but is no longer on his profile.
update public.members set status_id = pg_temp.option('status', 'Man') where user_id = (select carl from ids);
set local role authenticated;
select is(pg_temp.search('{"age_min": 30, "age_max": 30}'), '{}'::text[], 'a person no longer on the profile doesn''t match an age');

-- Applicant ------------------------------------------------------------------------------------
select pg_temp.as_user(hana) from ids;
select is_empty($$ select 1 from public.search_profiles((select biking from ids)) $$, 'an applicant gets no search');
select throws_ok($$ select public.save_search_filter(biking, '{}') from ids $$, '42501', null, 'an applicant can''t save a filter');
select is_empty($$ select 1 from public.find_new((select biking from ids), 'Test') $$, 'an applicant gets no Find new');

-- Find new user/group --------------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select public.open_dm(biking, bert) from ids;
select is(
  (select array_agg(f.name order by lower(f.name)) from public.find_new((select biking from ids), 'test', true, false) as f where f.id::text like 'd0000000-%'),
  array['Test carl', 'Test dora', 'Test eddy', 'Test ivan'],
  'Find new user: people you have no DM with; never yourself, hidden, blocked or applicants'
);
select is(
  (select array_agg(f.kind || ' ' || f.name order by lower(f.name)) from public.find_new((select biking from ids), 'HILL') as f where f.id::text like 'd0000000-%'),
  array['group Test Hill Climbers'],
  'Find new group: visible groups you are not in, any case'
);
select is_empty($$ select 1 from public.find_new((select biking from ids), 't') $$, 'nothing until 2 characters are typed');
select is_empty($$ select 1 from public.find_new((select biking from ids), 'st_') where id::text like 'd0000000-%' $$, 'LIKE characters are matched as text ("st_" is not "st ")');

select * from finish();
rollback;
