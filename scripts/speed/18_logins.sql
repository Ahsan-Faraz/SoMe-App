-- Step 17 speed check, rolled back at the end: the login steps with 20,000 logins on two sites (the
-- same 10,000 emails on each) and 10,000 members in one community.
-- Targets: each step of a log-in, sign-up or reset adds under 5 ms.
-- Run: npx supabase db query --linked -f scripts/speed/18_logins.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated, service_role;

insert into public.communities (site, slug, name, headline, privacy_version) values
  ('speed-a', 'speed-demo', 'Speed A', '', 'test'),
  ('speed-b', 'speed-demo', 'Speed B', '', 'test');
create temp table seed as select
  (select id from public.communities where site = 'speed-a' and slug = 'speed-demo') as com_a,
  (select id from public.communities where site = 'speed-b' and slug = 'speed-demo') as com_b;
grant select on seed to authenticated, service_role;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('7e000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Logins 1–10,000 on site a (each with an account in its community), 10,001–20,000 on site b.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select pg_temp.u(n), pg_temp.u(n) || '@speed.login.invalid', case when n % 10 <> 0 then now() end,
  jsonb_build_object('community_id', case when n <= 10000 then seed.com_a else seed.com_b end, 'username', 'Test speed17 ' || n,
    'site', case when n <= 10000 then 'speed-a' else 'speed-b' end, 'login_email', 'speed17-' || ((n - 1) % 10000 + 1) || '@test.invalid',
    'consents', '{"privacy": "test"}'::jsonb)
from seed, generate_series(1, 20000) as n;
analyze public.logins;
analyze public.members;

create function pg_temp.time(p_name text, p_sql text, p_target numeric, p_runs integer default 5) returns void
language plpgsql as $$
declare
  v_plan json;
  v_best numeric;
  v_ms numeric;
begin
  for i in 1..p_runs loop
    execute 'explain (analyze, format json) ' || p_sql into v_plan;
    v_ms := (v_plan -> 0 ->> 'Execution Time')::numeric;
    v_best := least(coalesce(v_best, v_ms), v_ms);
  end loop;
  insert into pg_temp.speed values (p_name, round(v_best, 2), p_target);
end
$$;
grant execute on function pg_temp.time(text, text, numeric, integer), pg_temp.u(integer) to authenticated, service_role;

set local role service_role;
select pg_temp.time('login_lookup: by email', format('select * from public.login_lookup(''speed-a'', %L, ''speed17-5001@test.invalid'')', (select com_a from seed)), 5);
select pg_temp.time('login_lookup: by username', format('select * from public.login_lookup(''speed-a'', %L, ''test SPEED17 5001'')', (select com_a from seed)), 5);
select pg_temp.time('login_lookup: nobody', format('select * from public.login_lookup(''speed-a'', %L, ''nobody@test.invalid'')', (select com_a from seed)), 5);
select pg_temp.time('join_prepare: a new email', format('select * from public.join_prepare(''speed-a'', %L, ''Test speed17 new'', ''speed17-new@test.invalid'')', (select com_a from seed)), 5);
select pg_temp.time('join_prepare: an email with a login', format('select * from public.join_prepare(''speed-a'', %L, ''Test speed17 new'', ''speed17-5001@test.invalid'')', (select com_a from seed)), 5);
-- The first delete in a session also plans every cascade (a one-off per database connection), so one
-- sign-up is removed first and the second is timed.
select 1 from public.join_prepare('speed-a', (select com_a from seed), 'Test speed17 new', 'speed17-4980@test.invalid');
select pg_temp.time('join_prepare: removes an unconfirmed sign-up', format('select * from public.join_prepare(''speed-a'', %L, ''Test speed17 new'', ''speed17-5000@test.invalid'')', (select com_a from seed)), 20, 1);
select pg_temp.time('login_code_new', format('select public.login_code_new(%L, ''reset'', null)', pg_temp.u(5001)), 5);
select pg_temp.time('reset_confirm: a wrong code', format('select * from public.reset_confirm(''speed-a'', %L, ''speed17-5001@test.invalid'', ''000000'')', (select com_a from seed)), 5, 3);
select pg_temp.time('signup_resend: another browser', 'select * from public.signup_resend(''speed-a'', ''speed17-4990@test.invalid'', ''nobody'')', 5);
reset role;

select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result from speed;
rollback;
