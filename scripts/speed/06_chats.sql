-- Step 5 speed check (docs/backend-design.md §11): chats on seeded data, rolled back at the end.
-- 5,000 members; one heavy user in 200 DMs (one of them 5,000 messages long); 2,399 more DMs with
-- 40 messages each: 120,000+ messages. Each hot call is timed as the heavy user (best of 5 runs).
-- Run: npx supabase db query --linked -f scripts/speed/06_chats.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;

-- Members -------------------------------------------------------------------------------------
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking;
grant select on seed to authenticated;

insert into auth.users (id, email, raw_user_meta_data)
select ('70000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'speed' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed ' || n, 'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 5000) as n;
update public.members set state = 'approved'
where user_id::text like '70000000-0000-4000-8000-%';

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('70000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- Chats: user 1 with users 2..201; users 202..4201 paired (202-203, 204-205, …) ----------------
create temp table pairs as
select n, least(pg_temp.u(1), pg_temp.u(n)) as a, greatest(pg_temp.u(1), pg_temp.u(n)) as b, case when n = 2 then 5000 else 100 end as msgs
from generate_series(2, 201) as n
union all
select n, least(pg_temp.u(n), pg_temp.u(n + 1)), greatest(pg_temp.u(n), pg_temp.u(n + 1)), 40
from generate_series(202, 4998, 2) as n;

insert into public.chats (id, community_id, kind, dm_user_a, dm_user_b, created_by, last_seq, last_message_at, last_message_preview)
select gen_random_uuid(), seed.biking, 'dm', p.a, p.b, p.a, p.msgs, now() - (p.n || ' minutes')::interval, 'Test message'
from seed, pairs p;

insert into public.chat_members (chat_id, community_id, user_id, last_read_seq)
select c.id, c.community_id, x.user_id, case when x.user_id = c.dm_user_a then c.last_seq else c.last_seq / 2 end
from public.chats c cross join lateral (values (c.dm_user_a), (c.dm_user_b)) as x (user_id)
where c.dm_user_a::text like '70000000-%';

insert into public.messages (chat_id, seq, community_id, author_id, body, created_at)
select c.id, s, c.community_id, case when s % 2 = 0 then c.dm_user_a else c.dm_user_b end,
  'Test message number ' || s || ' with a little text in it, like a normal chat line.',
  now() - ((c.last_seq - s) || ' seconds')::interval
from public.chats c cross join generate_series(1, c.last_seq) as s
where c.dm_user_a::text like '70000000-%';

analyze public.chats, public.chat_members, public.messages, public.members;

-- Timing helper: best of 5 runs, as the heavy user --------------------------------------------
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
grant execute on function pg_temp.time(text, text, numeric), pg_temp.u(integer) to authenticated;

create temp table heavy as select c.id as big_chat from public.chats c where c.dm_user_a = least(pg_temp.u(1), pg_temp.u(2)) and c.dm_user_b = greatest(pg_temp.u(1), pg_temp.u(2));
grant select on heavy to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);

select pg_temp.time('chat_list (200 chats, first 50)', format('select * from public.chat_list(%L, 50)', (select biking from seed)), 20);
select pg_temp.time('chat_header', format('select * from public.chat_header(%L, %L)', (select biking from seed), (select big_chat from heavy)), 15);
select pg_temp.time('list_messages newest 30 (5,000-message chat)', format('select * from public.list_messages(%L, %L, null, null, 30)', (select biking from seed), (select big_chat from heavy)), 15);
select pg_temp.time('list_messages older page (before 2,500)', format('select * from public.list_messages(%L, %L, 2500, null, 30)', (select biking from seed), (select big_chat from heavy)), 15);
select pg_temp.time('list_messages catch-up (after 4,990)', format('select * from public.list_messages(%L, %L, null, 4990, 100)', (select biking from seed), (select big_chat from heavy)), 15);
select pg_temp.time('find_dm', format('select public.find_dm(%L, %L)', (select biking from seed), pg_temp.u(2)), 15);
select pg_temp.time('open_dm (existing)', format('select public.open_dm(%L, %L)', (select biking from seed), pg_temp.u(2)), 15);
select pg_temp.time('send_message', format('select public.send_message(%L, %L, %L)', (select biking from seed), (select big_chat from heavy), 'Speed test'), 15);
select pg_temp.time('mark_read', format('select public.mark_read(%L, %L, 99999)', (select biking from seed), (select big_chat from heavy)), 15);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result,
  (select count(*) from public.messages where author_id::text like '70000000-%') as seeded_messages
from speed;
rollback;
