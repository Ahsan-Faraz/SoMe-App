begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

-- Fixtures -------------------------------------------------------------------------------------
-- Two sites with a community each at the same address; the same email signs up on both.
insert into public.communities (site, slug, name, headline, privacy_version) values
  ('test-a', 'test-demo', 'Test A', '', 'test'),
  ('test-b', 'test-demo', 'Test B', '', 'test');

create temp table ids as select
  (select id from public.communities where site = 'test-a' and slug = 'test-demo') as com_a,
  (select id from public.communities where site = 'test-b' and slug = 'test-demo') as com_b,
  'a2200000-0000-4000-8000-00000000000a'::uuid as ann_a, -- ann@test.invalid on site a
  'a2200000-0000-4000-8000-00000000000b'::uuid as ann_b, -- the same email on site b
  'a2200000-0000-4000-8000-00000000000c'::uuid as old, -- signed up by a build before this step
  'a2200000-0000-4000-8000-00000000000d'::uuid as squat; -- never confirms
grant select on ids to anon, authenticated;

create temp table saved (name text primary key, value text);
grant all on saved to anon, authenticated;

create function pg_temp.sign_up(p_id uuid, p_site text, p_community uuid, p_username text, p_email text, p_confirmed boolean) returns void
language sql as $$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (p_id, p_id || '@' || p_site || '.login.invalid', case when p_confirmed then now() end,
    jsonb_build_object('community_id', p_community, 'username', p_username, 'site', p_site, 'login_email', p_email, 'consents', '{"privacy": "test"}'::jsonb))
$$;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;

-- Sign-up ----------------------------------------------------------------------------------------
select pg_temp.sign_up(ann_a, 'test-a', com_a, 'Test Ann', ' Ann@Test.invalid ', true) from ids;
select is((select site || ' ' || email from public.logins where user_id = (select ann_a from ids)), 'test-a ann@test.invalid', 'a sign-up saves its site and real email, lower-cased');
select lives_ok($$ select pg_temp.sign_up(ann_b, 'test-b', com_b, 'Test Ann', 'ann@test.invalid', true) from ids $$, 'the same email signs up on another site');
select is((select count(*)::int from public.logins where email = 'ann@test.invalid'), 2, 'as two separate logins');
select throws_ok(
  $$ select pg_temp.sign_up('a2200000-0000-4000-8000-0000000000ff', 'test-a', com_a, 'Test Ann 2', 'ann@test.invalid', true) from ids $$,
  '23505', null, 'but only once per site'
);
select throws_ok(
  $$ select pg_temp.sign_up('a2200000-0000-4000-8000-0000000000ff', 'test-a', com_b, 'Test Cross', 'cross@test.invalid', true) from ids $$,
  '42501', null, 'a sign-up can''t put a login of one site into a community of another'
);
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select old, 'old@test.invalid', now(), jsonb_build_object('community_id', com_a, 'username', 'Test Old', 'consents', '{"privacy": "test"}'::jsonb) from ids;
select is((select site || ' ' || email from public.logins where user_id = (select old from ids)), 'test-a old@test.invalid', 'an older build''s sign-up gets its login from the Auth email and the community''s site');

-- A login stays on its site ------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(ann_a) from ids;
select throws_ok($$ select public.join_community((select com_b from ids), 'Test Ann A', '{"privacy": "test"}') $$, '42501', null, 'a login can''t join a community on another site');
select throws_ok($$ select 1 from public.logins $$, '42501', null, 'no client reads the logins table');
select throws_ok($$ select 1 from public.login_lookup('test-a', (select com_a from ids), 'ann@test.invalid') $$, '42501', null, 'nor looks a login up');
select throws_ok($$ select public.login_code_new((select ann_a from ids), 'reset', null) $$, '42501', null, 'nor makes a code');
reset role;

-- Lookup -------------------------------------------------------------------------------------------
select is((select user_id from public.login_lookup('test-a', (select com_a from ids), 'ANN@test.invalid ')), (select ann_a from ids), 'an email finds its login on this site');
select is((select user_id from public.login_lookup('test-b', (select com_b from ids), 'ann@test.invalid')), (select ann_b from ids), 'and the other login on the other site');
select is((select auth_email from public.login_lookup('test-a', (select com_a from ids), 'test ann')), (select ann_a || '@test-a.login.invalid' from ids), 'a username finds its login, with the address Auth signs in with');
select is_empty($$ select 1 from public.login_lookup('test-b', (select com_a from ids), 'test ann') $$, 'a username of a community on another site finds nothing');
select is_empty($$ select 1 from public.login_lookup('test-a', (select com_a from ids), 'nobody@test.invalid') $$, 'an unknown email finds nothing');
select is_empty($$ select 1 from public.login_lookup('test-a', (select com_a from ids), 'No-reply') $$, 'the No-reply account has no login');

-- Join form ----------------------------------------------------------------------------------------
select throws_ok($$ select 1 from public.join_prepare('test-b', (select com_a from ids), 'Test New', 'new@test.invalid') $$, '22023', null, 'joining a community through another site is refused');
select results_eq(
  $$ select username_taken, user_id from public.join_prepare('test-a', (select com_a from ids), 'test ANN', 'new@test.invalid') $$,
  $$ values (true, null::uuid) $$,
  'a taken username is told; a new email has no login'
);
select results_eq(
  $$ select username_taken, user_id from public.join_prepare('test-a', (select com_a from ids), 'Test New', 'ann@test.invalid') $$,
  $$ select false, ann_a from ids $$,
  'an email with a confirmed login on this site is found, and kept'
);
select pg_temp.sign_up(squat, 'test-a', com_a, 'Test Squat', 'victim@test.invalid', false) from ids;
select results_eq(
  $$ select username_taken, user_id from public.join_prepare('test-a', (select com_a from ids), 'Test Squat', 'victim@test.invalid') $$,
  $$ values (false, null::uuid) $$,
  'a sign-up that was never confirmed gives way: the email and the username are free again'
);
select is_empty($$ select 1 from auth.users where id = (select squat from ids) $$, 'and its login is gone');

-- Sign-up codes ------------------------------------------------------------------------------------
select pg_temp.sign_up(squat, 'test-a', com_a, 'Test Squat', 'victim@test.invalid', false) from ids;
select throws_ok($$ select public.login_code_new((select squat from ids), 'signup', null) $$, '22023', null, 'a sign-up code needs the browser that asked for it');
insert into saved select 'code', public.login_code_new(squat, 'signup', 'holder-1') from ids;
select ok((select value ~ '^\d{6}$' from saved where name = 'code'), 'a code is 6 digits');
select is_empty($$ select 1 from private.login_codes where code_hash = (select value from saved where name = 'code') $$, 'only its hash is kept');
select is_empty(
  $$ select 1 from public.signup_confirm('test-a', 'victim@test.invalid', (select value from saved where name = 'code'), 'holder-2') $$,
  'the right code in another browser confirms nothing'
);
select is_empty($$ select 1 from public.signup_resend('test-a', 'victim@test.invalid', 'holder-2') $$, 'and another browser gets no new code');
insert into saved select 'code2', code from public.signup_resend('test-a', 'victim@test.invalid', 'holder-1');
select is_empty(
  $$ select 1 from public.signup_confirm('test-a', 'victim@test.invalid', (select value from saved where name = 'code'), 'holder-1') $$,
  'a new code replaces the old one'
);
select is_empty(
  $$ select 1 from public.signup_confirm('test-b', 'victim@test.invalid', (select value from saved where name = 'code2'), 'holder-1') $$,
  'a code is for its own site'
);
select is(
  (select user_id from public.signup_confirm('test-a', 'victim@test.invalid', (select value from saved where name = 'code2'), 'holder-1')),
  (select squat from ids), 'the right code in the right browser returns the login'
);
select is_empty(
  $$ select 1 from public.signup_confirm('test-a', 'victim@test.invalid', (select value from saved where name = 'code2'), 'holder-1') $$,
  'a code works once'
);

-- Reset codes: 5 tries, then even the right code fails -----------------------------------------------
insert into saved select 'reset', public.login_code_new(ann_a, 'reset', null) from ids;
select is_empty(
  $$ select 1 from public.reset_confirm('test-b', (select com_b from ids), 'ann@test.invalid', (select value from saved where name = 'reset')) $$,
  'a reset code doesn''t work for the same email on another site'
);
select is(
  (select user_id from public.reset_confirm('test-a', (select com_a from ids), 'Test Ann', (select value from saved where name = 'reset'))),
  (select ann_a from ids), 'the right reset code returns the login, by username too'
);
select isnt_empty($$ select 1 from private.login_codes where user_id = (select ann_a from ids) and kind = 'reset' $$, 'the code stays until the new password is saved');
insert into auth.sessions (id, user_id) select gen_random_uuid(), ann_a from ids;
select public.reset_finish(ann_a) from ids;
select is_empty(
  $$ select 1 from public.reset_confirm('test-a', (select com_a from ids), 'ann@test.invalid', (select value from saved where name = 'reset')) $$,
  'then it is used up'
);
select is_empty($$ select 1 from auth.sessions where user_id = (select ann_a from ids) $$, 'and every session of the login has ended');
insert into saved select 'reset2', public.login_code_new(ann_a, 'reset', null) from ids;
select public.reset_confirm('test-a', com_a, 'ann@test.invalid', 'x') from ids, generate_series(1, 5);
select is((select tries::int from private.login_codes where user_id = (select ann_a from ids) and kind = 'reset'), 5, 'wrong codes are counted');
select is_empty(
  $$ select 1 from public.reset_confirm('test-a', (select com_a from ids), 'ann@test.invalid', (select value from saved where name = 'reset2')) $$,
  'after 5 wrong tries the right code no longer works'
);
update private.login_codes set tries = 0, expires_at = now() - interval '1 minute' where user_id = (select ann_a from ids) and kind = 'reset';
select is_empty(
  $$ select 1 from public.reset_confirm('test-a', (select com_a from ids), 'ann@test.invalid', (select value from saved where name = 'reset2')) $$,
  'nor does an expired one'
);

-- Approval email, and deleting a login ----------------------------------------------------------------
select is(
  (select strpos(prosrc, 'from public.logins l where l.user_id = v_app.user_id') > 0 from pg_proc where proname = 'decide_application' and pronamespace = 'public'::regnamespace),
  true, 'the approval email goes to the login''s real address'
);
delete from auth.users where id = (select ann_b from ids);
select is((select count(*)::int from public.logins where email = 'ann@test.invalid'), 1, 'deleting a login leaves the same email''s login on the other site');

select * from finish();
rollback;
