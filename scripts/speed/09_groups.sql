-- Step 7 speed check: groups on seeded data, rolled back at the end.
-- 5,000 members; 200 groups; one big group with 2,000 members, 500 open applications and 5,000
-- messages. Timed as its group admin (member 1) and as an ordinary member (best of 5).
-- Run: npx supabase db query --linked -f scripts/speed/09_groups.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking;
grant select on seed to authenticated;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('75000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.g(n integer) returns uuid language sql immutable as $$
  select ('76000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed7-' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed7 ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 5000) as n;
update public.members set state = 'approved' where user_id::text like '75000000-%';

-- 200 groups; member n runs group n. Group 1 is the big one.
insert into public.chats (id, community_id, kind, name, headline, created_by, history, member_list, direct_join)
select pg_temp.g(n), seed.biking, 'group', 'Test group ' || n, 'Test rides', pg_temp.u(n), n % 2 = 0, true, n % 3 = 0
from seed, generate_series(1, 200) as n;
insert into public.chat_members (chat_id, community_id, user_id, role)
select pg_temp.g(n), seed.biking, pg_temp.u(n), 'admin' from seed, generate_series(1, 200) as n;
insert into public.chat_members (chat_id, community_id, user_id)
select pg_temp.g(1), seed.biking, pg_temp.u(n) from seed, generate_series(2, 2001) as n;
insert into public.group_info_posts (chat_id, community_id, n, headline, body)
select pg_temp.g(g), seed.biking, k, 'Info ' || k, 'Test info text' from seed, generate_series(1, 200) as g, generate_series(1, 3) as k;
insert into public.applications (community_id, user_id, chat_id, message, real_name_1)
select seed.biking, pg_temp.u(n), pg_temp.g(1), 'Test application', 'Real ' || n from seed, generate_series(2002, 2501) as n;
insert into public.messages (chat_id, seq, community_id, author_id, body)
select pg_temp.g(1), s, seed.biking, pg_temp.u(1 + s % 2000), 'Test message ' || s from seed, generate_series(1, 5000) as s;
update public.chats set last_seq = 5000, last_message_at = now() where id = pg_temp.g(1);
analyze public.chats, public.chat_members, public.applications, public.group_info_posts, public.messages, public.members;

create function pg_temp.time(p_name text, p_sql text, p_target numeric) returns void language plpgsql as $$
declare
  v_plan json;
  v_best numeric;
  v_ms numeric;
begin
  for i in 1..5 loop
    execute 'explain (analyze, format json) ' || replace(p_sql, '$i', i::text) into v_plan;
    v_ms := (v_plan -> 0 ->> 'Execution Time')::numeric;
    v_best := least(coalesce(v_best, v_ms), v_ms);
  end loop;
  insert into pg_temp.speed values (p_name, round(v_best, 2), p_target);
end
$$;
grant execute on function pg_temp.time(text, text, numeric), pg_temp.u(integer), pg_temp.g(integer) to authenticated;
-- The applications to approve, picked before switching role (members can't read applications).
create temp table to_approve as select row_number() over (order by user_id) as i, id from public.applications where chat_id = pg_temp.g(1) limit 5;
grant select on to_approve to authenticated;

set local role authenticated;
-- As the group admin of the big group.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
select pg_temp.time('group_info (G3, 2,001 members, first 500)', format('select public.group_info(%L, %L)', (select biking from seed), pg_temp.g(1)), 50);
select pg_temp.time('group_settings (A10)', format('select public.group_settings(%L, %L)', (select biking from seed), pg_temp.g(1)), 15);
select pg_temp.time('group_roster members (2,001)', format('select * from public.group_roster(%L, %L, false)', (select biking from seed), pg_temp.g(1)), 50);
select pg_temp.time('group_roster applications (500 open)', format('select * from public.group_roster(%L, %L, true)', (select biking from seed), pg_temp.g(1)), 50);
select pg_temp.time('group_member (A22)', format('select public.group_member(%L, %L, %L)', (select biking from seed), pg_temp.g(1), pg_temp.u(2100)), 15);
select pg_temp.time('chat_header (group, with rules)', format('select * from public.chat_header(%L, %L)', (select biking from seed), pg_temp.g(1)), 15);
select pg_temp.time('send_message (group, rules)', format('select public.send_message(%L, %L, %L)', (select biking from seed), pg_temp.g(1), 'Test speed'), 15);
-- Each run approves a different application: member added, record, No-reply DM.
select pg_temp.time('decide_application (group approve + No-reply DM)',
  format('select public.decide_application((select id from to_approve where i = $i), %L)', 'approved'), 20);
select pg_temp.time('save_group (edit)', format('select public.save_group(%L, %L, %L)', (select biking from seed), pg_temp.g(1),
  '{"name": "Test group 1", "headline": "Test", "infos": [{"headline": "Rules", "body": "x"}]}'), 15);
-- As an ordinary member who is in no group.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(4900), 'role', 'authenticated')::text, true);
select pg_temp.time('group_directory (200 groups, first 50)', format('select * from public.group_directory(%L)', (select biking from seed)), 20);
select pg_temp.time('group_card (A24)', format('select public.group_card(%L, %L)', (select biking from seed), pg_temp.g(5)), 15);
select pg_temp.time('chat_list (member of none)', format('select * from public.chat_list(%L)', (select biking from seed)), 20);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result from speed;
rollback;
