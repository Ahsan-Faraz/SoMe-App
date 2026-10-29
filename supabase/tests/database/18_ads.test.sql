begin;
create extension if not exists pgtap with schema extensions;

select plan(65);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'a1400000-0000-4000-8000-00000000000a'::uuid as anna, -- Woman, writes ads
  'a1400000-0000-4000-8000-00000000000b'::uuid as bert, -- Man, reads them
  'a1400000-0000-4000-8000-00000000000c'::uuid as carl, -- Couple MF, community admin
  'a1400000-0000-4000-8000-00000000000d'::uuid as dora, -- Anna blocked her
  'a1400000-0000-4000-8000-00000000000e'::uuid as erik, -- applicant
  'a1400000-0000-4000-8000-00000000000f'::uuid as fred, -- hidden from search
  'a1400000-0000-4000-8000-000000000010'::uuid as gina; -- removed later
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test', show_visibility = true, show_age = true, show_score = true;
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test a14 ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values
  (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dora, 'dora'), (ids.erik, 'erik'), (ids.fred, 'fred'), (ids.gina, 'gina')
) as u (id, name);

create function pg_temp.option(p_list text, p_label text) returns uuid language sql stable as $$
  select o.id from public.community_options o join ids on o.community_id = ids.biking
  where o.list = p_list and o.label ->> 'en' = p_label
$$;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;

update public.members m set state = 'approved', visible_in_search = u.visible, status_id = pg_temp.option('status', u.status), score = u.score
from ids cross join lateral (values
  (ids.anna, true, 'Woman', 40), (ids.bert, true, 'Man', 20), (ids.carl, true, 'Couple MF', 60),
  (ids.dora, true, 'Woman', 50), (ids.fred, false, 'Man', 70), (ids.gina, true, 'Woman', 30)
) as u (id, visible, status, score)
where m.user_id = u.id;
update public.members set state = 'applied' where user_id = (select erik from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);
insert into public.blocks (community_id, blocker_id, blocked_id) select biking, anna, dora from ids;
insert into public.profile_people (community_id, user_id, substatus_id, n, birth_date)
select ids.biking, p.id, pg_temp.option('substatus', p.sub), 1, (current_date - make_interval(years => p.age))::date
from ids cross join lateral (values (ids.anna, 'The Woman', 30), (ids.bert, 'The Man', 45), (ids.carl, 'The Man', 66), (ids.carl, 'The Woman', 28)) as p (id, sub, age);

-- Uploaded files in each member's folder of the private bucket (photo n: …0f<n>.webp and _t.webp).
create function pg_temp.file(p_user uuid, n integer, p_thumb boolean default false) returns text language sql stable as $$
  select (select biking from ids) || '/' || p_user || '/a1400000-0000-4000-8000-0000000000f' || n || case when p_thumb then '_t' else '' end || '.webp'
$$;
create function pg_temp.photo(p_user uuid, n integer) returns jsonb language sql stable as $$
  select jsonb_build_object('path', pg_temp.file(p_user, n), 'thumb_path', pg_temp.file(p_user, n, true), 'width', 1600, 'height', 1200, 'taken_in_app', n = 1)
$$;
insert into storage.objects (bucket_id, name)
select 'private', pg_temp.file(u, n, t) from ids, unnest(array[ids.anna, ids.bert, ids.carl, ids.dora, ids.fred, ids.gina]) as u,
  generate_series(1, 4) as n, unnest(array[false, true]) as t;

create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;
create function pg_temp.ad(p_name text) returns uuid language sql as $$ select id from saved where name = p_name $$;
-- Publish an ad as the caller: Looking for and district by name.
create function pg_temp.publish(p_headline text, p_looking text[], p_district text, p_place text, p_body text, p_photo jsonb default null) returns uuid language sql as $$
  select (public.save_ad((select biking from ids), null, array(select pg_temp.option('status', x) from unnest(p_looking) as x),
    p_headline, p_body, pg_temp.option('district', p_district), p_place, p_photo) ->> 'id')::uuid
$$;
-- The fixture ads in the caller's Ads tab, in its order (live ads are left out).
create function pg_temp.found() returns text[] language sql as $$
  select coalesce(array_agg(s.headline order by s.published_at desc, s.id desc), '{}')
  from public.search_ads((select biking from ids), 100) as s
  where s.user_id::text like 'a1400000-%'
$$;
create function pg_temp.search(p_filter jsonb) returns text[] language sql as $$
  select public.save_ad_filter((select biking from ids), p_filter);
  select pg_temp.found();
$$;
create function pg_temp.readable(p_names text[]) returns integer language sql as $$
  select count(*)::integer from storage.objects where bucket_id = 'private' and name = any (p_names)
$$;
grant execute on function pg_temp.option(text, text), pg_temp.as_user(uuid), pg_temp.file(uuid, integer, boolean), pg_temp.photo(uuid, integer),
  pg_temp.ad(text), pg_temp.publish(text, text[], text, text, text, jsonb), pg_temp.found(), pg_temp.search(jsonb), pg_temp.readable(text[])
to anon, authenticated;

-- Schema ---------------------------------------------------------------------------------------
select has_table('public', 'ads', 'ads table exists');
select is((select relrowsecurity from pg_class where oid = 'public.ads'::regclass), true, 'ads has RLS on');

set local role anon;
select throws_ok($$ select public.search_ads(biking) from ids $$, '42501', null, 'anon can''t search ads');
reset role;

-- Publishing -----------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(erik) from ids;
select throws_ok($$ select pg_temp.publish('Test x', array['Man'], 'Stockholm', '', 'x') $$, '42501', null, 'an applicant can''t publish an ad');
select throws_ok($$ select public.save_ad_filter(biking, '{}') from ids $$, '42501', null, 'nor save an ad filter');

select pg_temp.as_user(anna) from ids;
insert into saved select 'gravel', pg_temp.publish('  Test Gravel partner ', array['Man', 'Woman'], 'Stockholm', 'Test Slussen', 'Tuesdays, lights on', pg_temp.photo(anna, 1)) from ids;
insert into saved select 'trail', pg_temp.publish('Test Trail company', array['Couple MF'], 'Blekinge', 'Test Nacka', 'After work');
select isnt(pg_temp.ad('gravel'), null, 'Anna publishes an ad with a camera photo');
select throws_ok($$ select pg_temp.publish('  ', array['Man'], 'Stockholm', '', 'x') $$, '22023', null, 'an ad needs a headline');
select throws_ok($$ select pg_temp.publish(repeat('x', 121), array['Man'], 'Stockholm', '', 'x') $$, '22023', null, 'of at most 120 characters');
select throws_ok($$ select pg_temp.publish('Test x', array[]::text[], 'Stockholm', '', 'x') $$, '22023', null, 'and something in Looking for');
select throws_ok($$ select public.save_ad(biking, null, null, 'Test x', '', null, '', null) from ids $$, '22023', null, 'Looking for can''t be null');
select throws_ok($$ select public.save_ad(biking, null, array[pg_temp.option('district', 'Stockholm')], 'Test x', '', null, '', null) from ids $$,
  '22023', null, 'Looking for takes Statuses only');
select throws_ok($$ select public.save_ad(biking, null, array[pg_temp.option('status', 'Man')], 'Test x', '', pg_temp.option('status', 'Man'), '', null) from ids $$,
  '22023', null, 'a district must be one of the community''s districts');
select throws_ok($$ select pg_temp.publish('Test x', array['Man'], 'Stockholm', '', repeat('x', 4001)) $$, '22023', null, 'a text is at most 4000 characters');
select throws_ok($$ select pg_temp.publish('Test x', array['Man'], 'Stockholm', '', 'x', pg_temp.photo(bert, 1)) from ids $$, '22023', null, 'an image only from your own folder');
select throws_ok($$ select pg_temp.publish('Test x', array['Man'], 'Stockholm', '', 'x', pg_temp.photo(anna, 9)) from ids $$, '22023', null, 'and only once uploaded');
select throws_ok($$ select headline from public.ads $$, '42501', null, 'nobody reads the ads table directly');
select throws_ok($$ select ad_filter from public.members $$, '42501', null, 'nor anyone''s saved ad filter');

-- Others publish too.
select pg_temp.as_user(dora) from ids;
insert into saved select 'dora', pg_temp.publish('Test Dora rides', array['Man'], 'Stockholm', '', 'x');
select pg_temp.as_user(fred) from ids;
insert into saved select 'fred', pg_temp.publish('Test Fred rides', array['Woman'], 'Stockholm', '', 'x');
select pg_temp.as_user(gina) from ids;
insert into saved select 'gina', pg_temp.publish('Test Gina rides', array['Man'], 'Stockholm', '', 'x', pg_temp.photo(gina, 2)) from ids;
select pg_temp.as_user(carl) from ids;
insert into saved select 'carl', pg_temp.publish('Test Carl rides', array['Woman'], 'Blekinge', 'Test Lund', 'Couples welcome');
reset role;
-- Newest first: publish times a minute apart, in this order (tomorrow, so ads on the live site come after them).
update public.ads a set published_at = now() + interval '1 day' - make_interval(mins => o.n)
from (values ('carl', 1), ('gina', 2), ('fred', 3), ('dora', 4), ('trail', 5), ('gravel', 6)) as o (name, n)
join saved s on s.name = o.name where a.id = s.id;
set local role authenticated;

-- Reading --------------------------------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
select is(pg_temp.found(), array['Test Carl rides', 'Test Gina rides', 'Test Dora rides', 'Test Trail company', 'Test Gravel partner'],
  'Bert''s Ads tab: newest first, without the member hidden from search');
select results_eq(
  $$ select username, status_id, ages, score, place, photo_taken_in_app, photo_thumb from public.search_ads((select biking from ids)) where id = pg_temp.ad('gravel') $$,
  $$ select 'Test a14 anna'::text, pg_temp.option('status', 'Woman'), array[30], 40::smallint, 'Test Slussen'::text, true, pg_temp.file(anna, 1, true) from ids $$,
  'a card: the author''s name, Status, age and score from the profile, the ad''s place and image'
);
select is((select ages from public.search_ads((select biking from ids)) where id = pg_temp.ad('carl')), array[66, 28], 'a couple''s card has both ages');
select is((select count(*)::int from public.member_ads((select biking from ids), (select fred from ids))), 1, 'a hidden member''s ads are still on their profile');
select is((select pg_temp.readable(array[pg_temp.file(anna, 1), pg_temp.file(anna, 1, true)]) from ids), 0,
  'Storage never lets another member read ad files (the server signs them after the read)');
select is((select public.ad_view(biking, pg_temp.ad('gravel')) ->> 'body' from ids), 'Tuesdays, lights on', 'Bert opens the ad: its text');
select is((select public.ad_view(biking, pg_temp.ad('gravel')) -> 'photo' ->> 'path' from ids), (select pg_temp.file(anna, 1) from ids), 'and its full image');
select is((select (public.ad_view(biking, pg_temp.ad('gravel')) ->> 'own')::boolean from ids), false, 'not his own');

-- Age, Status and score always come from the profile.
reset role;
update public.profile_people set birth_date = (current_date - interval '31 years')::date where user_id = (select anna from ids);
update public.members set score = 45 where user_id = (select anna from ids);
set local role authenticated;
select pg_temp.as_user(bert) from ids;
select is((select ages from public.search_ads((select biking from ids)) where id = pg_temp.ad('gravel')), array[31], 'Anna changes her birth date: her ad shows the new age');
select is((select score from public.search_ads((select biking from ids)) where id = pg_temp.ad('gravel')), 45::smallint, 'and her new score');
select is((select (public.ad_view(biking, pg_temp.ad('gravel')) -> 'ages' ->> 0)::int from ids), 31, 'on the ad too');

-- Blocks, either way; removed members; applicants.
select pg_temp.as_user(anna) from ids;
select is('Test Dora rides' = any (pg_temp.found()), false, 'Anna doesn''t see the ads of someone she blocked');
select is((select count(*)::int from public.member_ads((select biking from ids), (select dora from ids))), 0, 'nor on her profile');
select is((select public.ad_view(biking, pg_temp.ad('dora')) from ids), null, 'nor one opened by link');
select pg_temp.as_user(dora) from ids;
select is(pg_temp.found() && array['Test Gravel partner', 'Test Trail company'], false, 'the blocked person doesn''t see Anna''s ads either');
select is((select public.ad_view(biking, pg_temp.ad('gravel')) from ids), null, 'not even by link');
select pg_temp.as_user(carl) from ids;
select is((select count(*)::int from public.member_ads((select biking from ids), (select anna from ids))), 2, 'the community admin sees Anna''s ads');
reset role;
update public.members set state = 'removed' where user_id = (select gina from ids);
set local role authenticated;
select pg_temp.as_user(bert) from ids;
select is('Test Gina rides' = any (pg_temp.found()), false, 'a removed member''s ads are gone from the Ads tab');
select is((select public.ad_view(biking, pg_temp.ad('gina')) from ids), null, 'and can''t be opened');
select pg_temp.as_user(erik) from ids;
select is(pg_temp.found(), '{}'::text[], 'an applicant sees no ads');

-- Filters (saved on the account) ---------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
select is(pg_temp.search('{"text": "gravel"}'), array['Test Gravel partner'], 'text in the headline');
select is(pg_temp.search('{"text": "LIGHTS"}'), array['Test Gravel partner'], 'text in the ad''s text, any case');
select is(pg_temp.search('{"text": "a14 carl"}'), array['Test Carl rides'], 'text in the author''s name');
select is(pg_temp.search('{"text": "test lund"}'), array['Test Carl rides'], 'text in the place');
select is(pg_temp.search(jsonb_build_object('statuses', jsonb_build_array(pg_temp.option('status', 'Woman')))),
  array['Test Dora rides', 'Test Trail company', 'Test Gravel partner'], 'the author''s Status');
select is(pg_temp.search(jsonb_build_object('looking_for', jsonb_build_array(pg_temp.option('status', 'Couple MF')))),
  array['Test Trail company'], 'the ad''s Looking for');
select is(pg_temp.search(jsonb_build_object('districts', jsonb_build_array(pg_temp.option('district', 'Blekinge')))),
  array['Test Carl rides', 'Test Trail company'], 'the ad''s district');
select is(pg_temp.search('{"place": "nacka"}'), array['Test Trail company'], 'the ad''s place');
select is(pg_temp.search('{"age_min": 31, "age_max": 31}'), array['Test Trail company', 'Test Gravel partner'], 'the author''s age');
select is(pg_temp.search('{"age_min": 60}'), array['Test Carl rides'], 'a couple matches when either person is in range');
select is(pg_temp.search('{"score_min": 45}'), array['Test Carl rides', 'Test Dora rides', 'Test Trail company', 'Test Gravel partner'], 'the author''s score');
select public.set_note(biking, anna, '{"body": "Test", "stars": 4}') from ids;
select is(pg_temp.search('{"stars_min": 3}'), array['Test Trail company', 'Test Gravel partner'], 'my stars for the author');
select is(pg_temp.search(jsonb_build_object('text', 'test', 'statuses', jsonb_build_array(pg_temp.option('status', 'Woman')), 'districts',
  jsonb_build_array(pg_temp.option('district', 'Stockholm')))), array['Test Dora rides', 'Test Gravel partner'], 'three filters combined');
select is((select public.ad_filter(biking) ->> 'text' from ids), 'test', 'the filter is saved on the account');
select lives_ok($$ select public.save_ad_filter(biking, jsonb_build_object('statuses', jsonb_build_array(gen_random_uuid()))) from ids $$, 'unknown ids are dropped');
select is((select public.ad_filter(biking) from ids), '{}'::jsonb, 'leaving an empty filter');
select throws_ok($$ select public.save_ad_filter(biking, '{"age_min": -1}') from ids $$, '22023', null, 'a bad number is refused');
select is((select count(*)::int from public.search_ads((select biking from ids), 2) where user_id::text like 'a1400000-%'), 2, 'pages hold at most p_limit');
select is((select array_agg(s.headline order by s.published_at desc) from public.search_ads((select biking from ids), 2,
  (select published_at from public.search_ads((select biking from ids), 2) order by published_at limit 1),
  (select id from public.search_ads((select biking from ids), 2) order by published_at limit 1)) as s where s.user_id::text like 'a1400000-%'),
  array['Test Trail company', 'Test Gravel partner'], 'the next page starts after the last ad');

-- Editing and deleting -------------------------------------------------------------------------
select throws_ok($$ select public.save_ad(biking, pg_temp.ad('gravel'), array[pg_temp.option('status', 'Man')], 'Test mine now', '', null, '', null) from ids $$,
  '42501', null, 'nobody edits someone else''s ad');
select throws_ok($$ select public.delete_ad(biking, pg_temp.ad('gravel')) from ids $$, '42501', null, 'or deletes it');
select pg_temp.as_user(anna) from ids;
select is((select public.save_ad(biking, pg_temp.ad('gravel'), array[pg_temp.option('status', 'Man')], 'Test Gravel partner wanted', 'Tuesdays', pg_temp.option('district', 'Stockholm'), 'Test Slussen', pg_temp.photo(anna, 3)) -> 'files' from ids),
  (select jsonb_build_array(pg_temp.file(anna, 1), pg_temp.file(anna, 1, true)) from ids), 'Anna replaces the image: the old files are returned to delete');
select results_eq(
  $$ select headline, photo_thumb, photo_taken_in_app, published_at = now() + interval '1 day' - interval '6 minutes' from public.member_ads((select biking from ids), (select anna from ids)) where id = pg_temp.ad('gravel') $$,
  $$ select 'Test Gravel partner wanted'::text, pg_temp.file(anna, 3, true), false, true from ids $$,
  'the edit shows, with the new image (an upload: not Taken in app); the publish date stays'
);
select is((select public.save_ad(biking, pg_temp.ad('trail'), array[pg_temp.option('status', 'Man')], 'Test Trail company', 'After work', null, '', null) -> 'files' from ids),
  '[]'::jsonb, 'an edit without a new image keeps it and returns no files');
select is((select public.delete_ad(biking, pg_temp.ad('gravel')) -> 'files' from ids),
  (select jsonb_build_array(pg_temp.file(anna, 3), pg_temp.file(anna, 3, true)) from ids), 'deleting returns the image''s files');
select is((select count(*)::int from public.member_ads((select biking from ids), (select anna from ids))), 1, 'the ad is gone');
reset role;
select is((select count(*)::int from public.photos where owner_id = (select anna from ids) and purpose = 'ad'), 0, 'and its photo rows');
set local role authenticated;
select pg_temp.as_user(anna) from ids;

-- The cap: 20 ads each.
select pg_temp.publish('Test cap ' || n, array['Man'], 'Stockholm', '', '') from generate_series(2, 20) as n;
select throws_ok($$ select pg_temp.publish('Test one too many', array['Man'], 'Stockholm', '', '') $$, '22023', null, 'at most 20 ads each');

select * from finish();
rollback;
