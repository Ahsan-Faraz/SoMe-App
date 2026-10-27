-- Step 11 speed check: member lists, applications, statistics and the group "+" list, rolled back
-- at the end. 5,000 members with community records, a group of 2,001 with group records, 500 open
-- community applications and 500 to the group. Timed as the community admin (best of 5). Targets:
-- 20 ms for a page and the statistics, 50 ms for a search by name (§11: a search, like profiles).
-- Run: npx supabase db query --linked -f scripts/speed/13_rosters.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;
create temp table seed as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '77000000-0000-4000-8000-100000000001'::uuid as grp;
grant select on seed to authenticated;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('77000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed11-' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed11 ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 6000) as n;
-- 1..5000 members (1 = the community admin), 5001..5500 applicants, 5501..6000 not applied yet.
create temp table statuses as select array(select o.id from public.community_options o join seed on o.community_id = seed.biking where o.list = 'status' order by o.position) as ids;
update public.members m set state = 'approved', status_id = s.ids[1 + g.n % cardinality(s.ids)]
from statuses s, generate_series(1, 5000) as g (n) where m.user_id = pg_temp.u(g.n);
update public.members set role = 'admin' where user_id = pg_temp.u(1);
update public.members set state = 'applied' where user_id in (select pg_temp.u(n) from generate_series(5001, 5500) as n);

insert into public.admin_records (scope_id, community_id, user_id, real_name_1, state_1, state_2, notes)
select seed.biking, seed.biking, pg_temp.u(n), 'Test Real ' || md5(n::text), n % 300, n % 7, 'Test note' from seed, generate_series(1, 5000) as n;

insert into public.chats (id, community_id, kind, name, created_by) select grp, biking, 'group', 'Test speed11 group', pg_temp.u(1) from seed;
insert into public.chat_members (chat_id, community_id, user_id, role)
select seed.grp, seed.biking, pg_temp.u(n), case when n = 2 then 'admin' else 'member' end from seed, generate_series(2, 2002) as n;
insert into public.admin_records (scope_id, community_id, user_id, real_name_1, state_1)
select seed.grp, seed.biking, pg_temp.u(n), 'Test Group Real ' || n, n % 50 from seed, generate_series(2, 2002) as n;

insert into public.applications (community_id, user_id, message, real_name_1, created_at)
select seed.biking, pg_temp.u(n), 'Test let me in', 'Test Applicant ' || n, now() - make_interval(mins => n) from seed, generate_series(5001, 5500) as n;
insert into public.applications (community_id, user_id, chat_id, message, created_at)
select seed.biking, pg_temp.u(n), seed.grp, 'Test can I join', now() - make_interval(mins => n) from seed, generate_series(3001, 3500) as n;

analyze public.members, public.admin_records, public.chat_members, public.applications;

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

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);

select pg_temp.time('A31 members: first 50 of 5,000', format('select * from public.roster_members(%L)', (select biking from seed)), 20);
select pg_temp.time('A31 members: a page deep in the list', format('select * from public.roster_members(%L, null, null, %L)', (select biking from seed), 'test speed11 4500'), 20);
select pg_temp.time('A31 search: a real name (few match)', format('select * from public.roster_members(%L, null, %L)', (select biking from seed), 'c4ca4238'), 50);
select pg_temp.time('A31 search: nobody matches (every row checked)', format('select * from public.roster_members(%L, null, %L)', (select biking from seed), 'kitty'), 50);
select pg_temp.time('A30 group: first 50 of 2,001', format('select * from public.roster_members(%L, %L)', (select biking from seed), (select grp from seed)), 20);
select pg_temp.time('A30 group: a page deep in the list', format('select * from public.roster_members(%L, %L, null, %L)', (select biking from seed), (select grp from seed), 'test speed11 900'), 20);
select pg_temp.time('A20 applications: first 50 of 500', format('select * from public.roster_applications(%L)', (select biking from seed)), 20);
select pg_temp.time('A23 group applications: first 50 of 500', format('select * from public.roster_applications(%L, %L)', (select biking from seed), (select grp from seed)), 20);
select pg_temp.time('A33 statistics: 5,000 members', format('select public.scope_stats(%L)', (select biking from seed)), 20);
select pg_temp.time('A28 statistics: group of 2,001', format('select public.scope_stats(%L, %L)', (select biking from seed), (select grp from seed)), 20);
select pg_temp.time('A30 "+": first names (not in the group)', format('select * from public.group_candidates(%L, %L)', (select biking from seed), (select grp from seed)), 20);
select pg_temp.time('A30 "+": search by name', format('select * from public.group_candidates(%L, %L, %L)', (select biking from seed), (select grp from seed), 'speed11 45'), 20);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result from speed;
rollback;
