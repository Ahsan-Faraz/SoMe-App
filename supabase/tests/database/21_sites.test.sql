begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  'a2100000-0000-4000-8000-000000000001'::uuid as pat, -- platform admin
  'a2100000-0000-4000-8000-000000000002'::uuid as mia; -- nobody special
grant select on ids to anon, authenticated;

insert into auth.users (id, email) select pat, 'pat21@test.invalid' from ids;
insert into auth.users (id, email) select mia, 'mia21@test.invalid' from ids;
insert into public.platform_admins (user_id) select pat from ids;

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;

create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;

-- Existing communities ---------------------------------------------------------------------------
select is((select site from public.communities where slug = 'biking-stockholm'), 'main', 'a community from before sites is on the default site');

-- Not for everyone -------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.create_community('test-site', 'test-demo', 'Test', '') $$, '42501', null, 'a visitor can''t create a community');
select throws_ok($$ select 1 from public.platform_communities('main') $$, '42501', null, 'nor list a site''s communities');
reset role;
set local role authenticated;
select pg_temp.as_user(mia) from ids;
select throws_ok($$ select public.create_community('test-site', 'test-demo', 'Test', '') $$, '42501', null, 'a member can''t create a community');
select is_empty($$ select 1 from public.platform_communities('main') $$, 'and sees no list');

-- The platform admin -----------------------------------------------------------------------------
select pg_temp.as_user(pat) from ids;
select throws_ok($$ select public.create_community('Test Site', 'test-demo', 'Test', '') $$, '22023', null, 'a site that isn''t a valid key is refused');
select throws_ok($$ select public.create_community(null, 'test-demo', 'Test', '') $$, '22023', null, 'so is no site');
select throws_ok($$ select public.create_community('test-site', 'platform', 'Test', '') $$, '22023', null, 'a reserved address is refused on any site');
insert into saved select 'a', public.create_community('test-site', ' Biking-Stockholm ', 'Test A', '');
select is(
  (select site || '/' || slug from public.communities where id = (select id from saved where name = 'a')),
  'test-site/biking-stockholm',
  'an address taken on one site is free on another'
);
select throws_ok($$ select public.create_community('test-site', 'biking-stockholm', 'Test again', '') $$, '23505', null, 'but only once per site');
select results_eq(
  $$ select name, members from public.platform_communities('test-site') $$,
  $$ values ('Test A', 0) $$,
  'a site''s list has its own communities only'
);
select is_empty(
  $$ select 1 from public.platform_communities('main') where id = (select id from saved where name = 'a') $$,
  'and they are not in another site''s list'
);
reset role;
select is((select count(*)::int from public.members where community_id = (select id from saved where name = 'a') and is_system), 1, 'the new community has its No-reply account');

select * from finish();
rollback;
