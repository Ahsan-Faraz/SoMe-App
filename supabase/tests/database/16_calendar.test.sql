begin;
create extension if not exists pgtap with schema extensions;

select plan(35);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'c1200000-0000-4000-8000-00000000000a'::uuid as anna, -- member of the group
  'c1200000-0000-4000-8000-00000000000b'::uuid as bert, -- member of the community, not of the group
  'c1200000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin, not in the group
  'c1200000-0000-4000-8000-00000000000e'::uuid as erik, -- member of the group, blocked by Gina
  'c1200000-0000-4000-8000-00000000000f'::uuid as gina; -- group admin
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test c12 ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values
  (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.erik, 'erik'), (ids.gina, 'gina')
) as u (id, name);
update public.members set state = 'approved' where user_id in (select unnest(array[anna, bert, carl, erik, gina]) from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);
update public.members set can_create_groups = true where user_id = (select gina from ids);
insert into public.blocks (community_id, blocker_id, blocked_id) select biking, gina, erik from ids;

create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
-- A month of the group as the current user: "date headline" per event, in order.
create function pg_temp.month(p_month date, p_chat text default 'rides') returns text[] language sql as $$
  select coalesce(array_agg(e.on_date || ' ' || e.headline order by e.on_date, e.headline), '{}')
  from public.calendar_month((select biking from ids), (select id from saved where name = p_chat), p_month) as e
$$;
create function pg_temp.creator(p_headline text) returns uuid language sql as $$
  select e.created_by from public.calendar_month((select biking from ids), (select id from saved where name = 'rides'), '2026-11-01') as e
  where e.headline = p_headline
$$;
-- Clients can't read events directly: these look at the table as its owner.
create function pg_temp.event(p_headline text) returns uuid language sql security definer as $$
  select id from public.events where headline = p_headline
$$;
create function pg_temp.stored(p_headline text) returns text language sql security definer as $$
  select on_date || '|' || headline || '|' || body || '|' || (created_by = (select gina from ids)) from public.events where headline = p_headline
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.month(date, text), pg_temp.creator(text), pg_temp.event(text), pg_temp.stored(text) to anon, authenticated;

set local role authenticated;
select pg_temp.as_user(gina) from ids;
insert into saved select 'rides', public.save_group(biking, null, '{"name": "Test c12 Rides"}') from ids;
insert into saved select 'other', public.save_group(biking, null, '{"name": "Test c12 Other"}') from ids;
select public.set_group_member(biking, (select id from saved where name = 'rides'), u, true)
from ids cross join lateral unnest(array[anna, erik]) as u;
reset role;

-- Schema ---------------------------------------------------------------------------------------
select has_table('public', 'events', 'events table exists');
select is((select relrowsecurity from pg_class where oid = 'public.events'::regclass), true, 'events has RLS on');

set local role anon;
select throws_ok($$ select * from public.calendar_month((select biking from ids), (select id from saved where name = 'rides'), '2026-11-01') $$,
  '42501', null, 'anon cannot read a calendar');
reset role;

-- Adding ---------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null, '{"on_date": "2026-11-02", "headline": "Test x"}') from ids $$,
  '42501', null, 'a member can''t add an event');
select throws_ok($$ insert into public.events (community_id, chat_id, on_date, headline) select biking, (select id from saved where name = 'rides'), '2026-11-02', 'x' from ids $$,
  '42501', null, 'nor write events directly');

select pg_temp.as_user(gina) from ids;
select lives_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null,
  '{"on_date": "2026-11-02", "headline": "  Test Slussen ride ", "body": "Meet at 9"}') from ids $$, 'the group admin adds an event');
select lives_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null, '{"on_date": "2026-11-30", "headline": "Test Month end"}') from ids $$,
  'and one at the end of the month');
select lives_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null, '{"on_date": "2026-12-01", "headline": "Test December"}') from ids $$,
  'and one the next month');
select is(pg_temp.stored('Test Slussen ride'), '2026-11-02|Test Slussen ride|Meet at 9|true', 'the headline is saved trimmed, Gina is its creator');
select throws_ok($$ select 1 from public.events $$, '42501', null, 'events can''t be read directly');

select throws_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null, '{"on_date": "2026-11-02", "headline": "  "}') from ids $$,
  '22023', null, 'an event needs a headline');
select throws_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null, jsonb_build_object('on_date', '2026-11-02', 'headline', repeat('x', 121))) from ids $$,
  '22023', null, 'a headline is at most 120 characters');
select throws_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null, jsonb_build_object('on_date', '2026-11-02', 'headline', 'Test', 'body', repeat('x', 4001))) from ids $$,
  '22023', null, 'a text is at most 4000 characters');
select throws_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null, '{"on_date": "tomorrow", "headline": "Test"}') from ids $$,
  '22023', null, 'a date must be YYYY-MM-DD (not "tomorrow")');
select throws_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null, '{"on_date": "1999-12-31", "headline": "Test"}') from ids $$,
  '22023', null, 'and a sensible one');

-- Reading a month ------------------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select is(pg_temp.month('2026-11-17'), array['2026-11-02 Test Slussen ride', '2026-11-30 Test Month end'], 'a member reads the month, by date (any day of it)');
select is(pg_temp.month('2026-12-01'), array['2026-12-01 Test December'], 'the next month is its own read');
select is(pg_temp.creator('Test Slussen ride'), (select gina from ids), '"DM Admin" opens a DM with the creator');
select pg_temp.as_user(erik) from ids;
select is(pg_temp.month('2026-11-01'), array['2026-11-02 Test Slussen ride', '2026-11-30 Test Month end'], 'a member Gina blocked still reads the calendar');
select is(pg_temp.creator('Test Slussen ride'), null, 'but gets no "DM Admin" (a block either way)');
select pg_temp.as_user(gina) from ids;
select is(pg_temp.creator('Test Slussen ride'), null, 'no "DM Admin" on your own event');
select pg_temp.as_user(bert) from ids;
select is(pg_temp.month('2026-11-01'), '{}'::text[], 'someone not in the group reads nothing');
select pg_temp.as_user(carl) from ids;
select is(pg_temp.month('2026-11-01'), array['2026-11-02 Test Slussen ride', '2026-11-30 Test Month end'], 'the community admin reads every group''s calendar');

-- Editing --------------------------------------------------------------------------------------
select lives_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), pg_temp.event('Test Month end'),
  '{"on_date": "2026-11-29", "headline": "Test Moved ride", "body": "New day"}') from ids $$, 'the community admin edits Gina''s event');
select is(pg_temp.stored('Test Moved ride'), '2026-11-29|Test Moved ride|New day|true', 'moved and renamed; Gina is still its creator');
select throws_ok($$ select public.save_event(biking, (select id from saved where name = 'other'), pg_temp.event('Test Moved ride'), '{"on_date": "2026-11-29", "headline": "Test"}') from ids $$,
  '22023', null, 'an event can''t be edited through another group');

-- 20 events a day at most.
reset role;
insert into public.events (community_id, chat_id, on_date, headline, created_by)
select biking, (select id from saved where name = 'rides'), '2026-11-02', 'Test filler ' || n, gina from ids, generate_series(1, 19) as n;
set local role authenticated;
select pg_temp.as_user(gina) from ids;
select throws_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null, '{"on_date": "2026-11-02", "headline": "Test 21st"}') from ids $$,
  '22023', null, 'a day takes at most 20 events');
select lives_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), pg_temp.event('Test Slussen ride'), '{"on_date": "2026-11-02", "headline": "Test Slussen ride", "body": "Meet at 10"}') from ids $$,
  'editing one of them on that day still works');

-- Deleting -------------------------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select public.delete_event(biking, (select id from saved where name = 'rides'), pg_temp.event('Test December')) from ids $$,
  '42501', null, 'a member can''t delete an event');
select pg_temp.as_user(gina) from ids;
select lives_ok($$ select public.delete_event(biking, (select id from saved where name = 'rides'), pg_temp.event('Test December')) from ids $$, 'the group admin deletes one');
select is(pg_temp.month('2026-12-01'), '{}'::text[], 'it is gone');

-- Calendar switched off ------------------------------------------------------------------------
select public.save_group(biking, (select id from saved where name = 'rides'), '{"name": "Test c12 Rides", "calendar": false}') from ids;
select pg_temp.as_user(anna) from ids;
select is(pg_temp.month('2026-11-01'), '{}'::text[], 'with the calendar off, members read nothing');
select pg_temp.as_user(gina) from ids;
select throws_ok($$ select public.save_event(biking, (select id from saved where name = 'rides'), null, '{"on_date": "2026-11-03", "headline": "Test off"}') from ids $$,
  '42501', null, 'and nothing can be added');

-- Cascades -------------------------------------------------------------------------------------
reset role;
delete from public.members where user_id = (select gina from ids);
select is((select count(*)::int from public.events where chat_id = (select id from saved where name = 'rides') and created_by is null), 21,
  'a deleted account leaves its events, without a creator');
delete from public.chats where id = (select id from saved where name = 'rides');
select is((select count(*)::int from public.events where chat_id = (select id from saved where name = 'rides')), 0, 'deleting the group deletes its events');

select * from finish();
rollback;
