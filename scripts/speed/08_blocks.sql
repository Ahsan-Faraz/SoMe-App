-- Step 6 speed check: the block checks on the hot paths, rolled back at the end.
-- 5,000 members; the viewer has blocked 200 people and been blocked by 200 more; 20,000 blocks in
-- all. Timed as the viewer (best of 5).
-- Run: npx supabase db query --linked -f scripts/speed/08_blocks.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking;
grant select on seed to authenticated;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('74000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed6-' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed6 ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 5000) as n;
update public.members set state = 'approved', visible_in_search = true, score = (hashtext(user_id::text) & 100)
where user_id::text like '74000000-%';

-- The viewer (1) blocked 2..201, was blocked by 202..401; 19,600 more blocks between others.
insert into public.blocks (community_id, blocker_id, blocked_id)
select seed.biking, pg_temp.u(1), pg_temp.u(n) from seed, generate_series(2, 201) as n
union all
select seed.biking, pg_temp.u(n), pg_temp.u(1) from seed, generate_series(202, 401) as n
union all
select seed.biking, pg_temp.u(n), pg_temp.u(n + 1 + (k * 7) % 4000) from seed, generate_series(402, 4401) as n, generate_series(0, 4) as k
where n + 1 + (k * 7) % 4000 <= 5000
on conflict do nothing;
analyze public.members, public.blocks;
-- Fresh rows wait in the trigram index's pending list (read in full by every search) until
-- autovacuum merges them; real data has been merged, so merge it here too.
select gin_clean_pending_list('public.members_username_trgm');

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
grant execute on function pg_temp.time(text, text, numeric), pg_temp.u(integer) to authenticated;

-- A DM between the viewer and member 4500 (no block), with a message.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
create temp table dm as select public.open_dm((select biking from seed), pg_temp.u(4500)) as id;

select pg_temp.time('search_profiles first 50 (minus 400 blocked)', format('select * from public.search_profiles(%L, 50)', (select biking from seed)), 20);
select pg_temp.time('member_names search, 1,111 matches (worst case)', format('select * from public.member_names(%L, %L)', (select biking from seed), 'speed6 4'), 15);
select pg_temp.time('member_names search, a few matches', format('select * from public.member_names(%L, %L)', (select biking from seed), 'speed6 432'), 15);
select pg_temp.time('member_names search, a name nobody has', format('select * from public.member_names(%L, %L)', (select biking from seed), 'kitty'), 15);
select pg_temp.time('profile() of someone not blocked', format('select public.profile(%L, %L)', (select biking from seed), pg_temp.u(4500)), 15);
select pg_temp.time('profile() of someone blocked (hidden)', format('select public.profile(%L, %L)', (select biking from seed), pg_temp.u(300)), 15);
select pg_temp.time('send_message (DM, block check)', format('select public.send_message(%L, %L, %L)', (select biking from seed), (select id from dm), 'Test speed'), 15);
select pg_temp.time('chat_header (with blocked flag)', format('select * from public.chat_header(%L, %L)', (select biking from seed), (select id from dm)), 15);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result,
  (select count(*) from public.blocks where blocker_id::text like '74000000-%') as seeded_blocks
from speed;
rollback;
