-- Step 12 speed check: the calendar's month read and the admin's writes, rolled back at the end.
-- 2,000 members, 200 groups, 130,000 events: one busy group with 20 events every day for three years
-- (the most a day takes, 600 a month), the others one event every other day. Timed as a member of the
-- busy group (read) and as its group admin (writes), best of 5. Target: a month under 15 ms (§11).
-- Run: npx supabase db query --linked -f scripts/speed/14_calendar.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking;
grant select on seed to authenticated;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('7c000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.g(n integer) returns uuid language sql immutable as $$
  select ('7c000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed12-' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed12 ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 2000) as n;
update public.members set state = 'approved' where user_id::text like '7c000000-%';

-- 200 groups; member 1 runs group 1, members 2–1990 are in it (1991–2000 are not); every other group has 9 members.
insert into public.chats (id, community_id, kind, name, created_by)
select pg_temp.g(n), seed.biking, 'group', 'Test speed12 group ' || n, pg_temp.u(1) from seed, generate_series(1, 200) as n;
insert into public.chat_members (chat_id, community_id, user_id, role)
select pg_temp.g(1), seed.biking, pg_temp.u(n), case when n = 1 then 'admin' else 'member' end from seed, generate_series(1, 1990) as n;
insert into public.chat_members (chat_id, community_id, user_id, role)
select pg_temp.g(g), seed.biking, pg_temp.u(1 + (g * 9 + k) % 2000), case when k = 0 then 'admin' else 'member' end
from seed, generate_series(2, 200) as g, generate_series(0, 8) as k
on conflict do nothing;

-- Group 1: 20 events a day, 2025–2027. The others: one every other day.
insert into public.events (community_id, chat_id, on_date, headline, body, created_by)
select seed.biking, pg_temp.g(1), d::date, 'Test ride ' || k, repeat('Meet at the usual place. ', 10), pg_temp.u(1 + k)
from seed, generate_series(date '2025-01-01', date '2027-12-31', interval '1 day') as d, generate_series(1, 20) as k;
insert into public.events (community_id, chat_id, on_date, headline, body, created_by)
select seed.biking, pg_temp.g(g), d::date, 'Test ride', 'Meet at 9', pg_temp.u(1)
from seed, generate_series(2, 200) as g, generate_series(date '2025-01-01', date '2027-12-31', interval '2 days') as d;
-- A few blocks around the reader, so "DM Admin" is worked out for real.
insert into public.blocks (community_id, blocker_id, blocked_id) select seed.biking, pg_temp.u(n), pg_temp.u(2) from seed, generate_series(3, 12) as n;
analyze public.events;
analyze public.chat_members;

-- Picked as the owner (clients can't read events): the event to edit, and a fresh one per timed delete.
create temp table picked as select (select id from public.events where chat_id = pg_temp.g(1) and on_date = '2026-11-02' limit 1) as edit_id;
create temp table victims as select row_number() over () as n, id from public.events where chat_id = pg_temp.g(1) and on_date = '2026-11-03' limit 5;
grant select on picked to authenticated;
create function pg_temp.victim() returns uuid language sql volatile security definer as $$
  delete from victims where n = (select min(n) from victims) returning id
$$;

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
grant execute on function pg_temp.time(text, text, numeric), pg_temp.u(integer), pg_temp.g(integer), pg_temp.victim() to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(2), 'role', 'authenticated')::text, true);
select pg_temp.time('calendar_month: busy group (600 events)', format('select * from public.calendar_month(%L, %L, %L)',
  (select biking from seed), pg_temp.g(1), '2026-11-01'), 15);
select pg_temp.time('calendar_month: a quiet month (none)', format('select * from public.calendar_month(%L, %L, %L)',
  (select biking from seed), pg_temp.g(1), '2028-06-01'), 15);
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(19), 'role', 'authenticated')::text, true);
select pg_temp.time('calendar_month: a normal group (15 events)', format('select * from public.calendar_month(%L, %L, %L)',
  (select biking from seed), pg_temp.g(2), '2026-11-01'), 15);
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1995), 'role', 'authenticated')::text, true);
select pg_temp.time('calendar_month: not a member (nothing)', format('select * from public.calendar_month(%L, %L, %L)',
  (select biking from seed), pg_temp.g(1) , '2026-11-01'), 15);

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
select pg_temp.time('save_event: add', format('select public.save_event(%L, %L, null, %L)',
  (select biking from seed), pg_temp.g(1), '{"on_date": "2028-01-15", "headline": "Test new ride", "body": "Meet at 9"}'), 15);
select pg_temp.time('save_event: edit on a full day', format('select public.save_event(%L, %L, %L, %L)',
  (select biking from seed), pg_temp.g(1), (select edit_id from picked),
  '{"on_date": "2026-11-02", "headline": "Test changed ride", "body": "Meet at 10"}'), 15);
select pg_temp.time('delete_event', format('select public.delete_event(%L, %L, pg_temp.victim())', (select biking from seed), pg_temp.g(1)), 15);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result,
  (select count(*) from public.events where chat_id::text like '7c000000-%') as seeded_events
from speed;
rollback;
