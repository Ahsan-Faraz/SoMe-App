begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- Fixtures -------------------------------------------------------------------------------------
-- Sign-ups go through the auth.users trigger, exactly like supabase.auth.signUp.
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '10000000-0000-4000-8000-00000000000a'::uuid as anna,
  '10000000-0000-4000-8000-00000000000b'::uuid as bert,
  '10000000-0000-4000-8000-00000000000c'::uuid as carl,
  '10000000-0000-4000-8000-00000000000d'::uuid as dora;
grant select on ids to anon, authenticated;

insert into public.communities (slug, name, headline) values ('test-other', 'Other', 'Another community');

insert into auth.users (id, email, raw_user_meta_data)
select anna, 'anna@test.invalid', jsonb_build_object('community_id', biking, 'username', 'Anna') from ids
union all
select bert, 'bert@test.invalid', jsonb_build_object('community_id', biking, 'username', ' Bert ', 'role', 'admin') from ids
union all
select carl, 'carl@test.invalid', jsonb_build_object('community_id', biking, 'username', 'Carl') from ids
union all
select dora, 'dora@test.invalid', jsonb_build_object(
  'community_id', (select id from public.communities where slug = 'test-other'), 'username', 'Dora') from ids;

-- Sign-up ------------------------------------------------------------------------------------
select results_eq(
  $$ select state, role from public.members where user_id = (select anna from ids) $$,
  $$ values ('profile'::text, 'member'::text) $$,
  'sign-up creates a member with state profile'
);
select results_eq(
  $$ select username, role from public.members where user_id = (select bert from ids) $$,
  $$ values ('Bert'::text, 'member'::text) $$,
  'sign-up trims the username and ignores a role in the metadata'
);
select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     select gen_random_uuid(), 'x1@test.invalid', jsonb_build_object('community_id', biking, 'username', 'anna') from ids $$,
  '23505', null, 'usernames are unique per community, ignoring case'
);
select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     select gen_random_uuid(), 'x2@test.invalid', jsonb_build_object('community_id', biking, 'username', 'an@na') from ids $$,
  '23514', null, 'a username cannot contain @'
);
select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     select gen_random_uuid(), 'x3@test.invalid', jsonb_build_object('community_id', biking, 'username', 'ab') from ids $$,
  '23514', null, 'a username has at least 3 characters'
);
insert into auth.users (id, email) values ('10000000-0000-4000-8000-0000000000ee', 'plain@test.invalid');
select is_empty(
  $$ select 1 from public.members where user_id = '10000000-0000-4000-8000-0000000000ee' $$,
  'a login without join metadata creates no member'
);

-- No-reply -----------------------------------------------------------------------------------
select results_eq(
  $$ select username, state, is_system from public.members m join ids on m.community_id = ids.biking where is_system $$,
  $$ values ('No-reply'::text, 'approved'::text, true) $$,
  'Biking Stockholm has a No-reply account'
);
select isnt_empty(
  $$ select 1 from public.members m join public.communities c on c.id = m.community_id
     where c.slug = 'test-other' and m.is_system $$,
  'a new community gets a No-reply account'
);

-- Server-only lookups ------------------------------------------------------------------------
select results_eq(
  $$ select username_taken, email_exists from public.join_check((select biking from ids), 'ANNA', ' Anna@Test.invalid ') $$,
  $$ values (true, true) $$,
  'join_check finds a taken username and an existing email, ignoring case'
);
select results_eq(
  $$ select username_taken, email_exists from public.join_check((select biking from ids), 'Newbie', 'new@test.invalid') $$,
  $$ values (false, false) $$,
  'join_check: free username, new email'
);
select is(public.member_email((select biking from ids), 'aNNa'), 'anna@test.invalid', 'member_email finds the email by username, ignoring case');
select is(public.member_email((select biking from ids), 'Nobody'), null, 'member_email: unknown username gives null');
select is(public.member_email((select biking from ids), 'No-reply'), null, 'member_email never returns the No-reply login');

-- Approve Anna, make Carl the admin.
update public.members set state = 'approved' where user_id = (select anna from ids);
update public.members set state = 'approved', role = 'admin' where user_id = (select carl from ids);

-- Anonymous ----------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select 1 from public.members $$, '42501', null, 'anon cannot read members');
select throws_ok(
  $$ select public.join_check('00000000-0000-0000-0000-000000000000', 'a', 'b') $$,
  '42501', null, 'anon cannot call join_check'
);
reset role;

-- Bert, applicant ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', bert, 'role', 'authenticated')::text, true) from ids;
select results_eq(
  $$ select username from public.members $$,
  $$ values ('Bert'::text) $$,
  'an applicant sees only their own account'
);
select throws_ok(
  $$ select public.member_email('00000000-0000-0000-0000-000000000000', 'a') $$,
  '42501', null, 'a logged-in user cannot call member_email'
);
select results_eq(
  $$ select private.is_member(biking), private.is_approved(biking) from ids $$,
  $$ values (true, false) $$,
  'helpers: an applicant is a member but not approved'
);

-- Anna, approved member ----------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', anna, 'role', 'authenticated')::text, true) from ids;
select results_eq(
  $$ select username from public.members m join ids on m.community_id = ids.biking
     where m.user_id in (ids.anna, ids.bert, ids.carl) or m.is_system order by username $$,
  $$ values ('Anna'::text), ('Carl'::text), ('No-reply'::text) $$,
  'an approved member sees approved members, not applicants'
);
select is_empty(
  $$ select 1 from public.members m join public.communities c on c.id = m.community_id where c.slug = 'test-other' $$,
  'a member sees nothing of another community'
);
select throws_ok(
  $$ update public.members set role = 'admin' where user_id = (select anna from ids) $$,
  '42501', null, 'a member cannot make themselves admin'
);
select throws_ok(
  $$ update public.members set state = 'approved' where user_id = (select bert from ids) $$,
  '42501', null, 'a member cannot approve anyone'
);
update public.members set last_login_at = '2000-01-01' where user_id = (select anna from ids);
update public.members set last_login_at = '2000-01-01' where user_id = (select bert from ids);
select results_eq(
  $$ select user_id = (select anna from ids), last_login_at = now() from public.members
     where user_id in (select anna from ids union all select bert from ids) $$,
  $$ values (true, true) $$,
  'last_login_at is always stamped with now(), and only on your own account'
);
select lives_ok(
  $$ insert into public.members (community_id, user_id, username)
     select c.id, ids.anna, 'Anna' from public.communities c, ids where c.slug = 'test-other' $$,
  'an existing login can join another community'
);
select throws_ok(
  $$ insert into public.members (community_id, user_id, username, state)
     select c.id, ids.anna, 'Anna3', 'approved' from public.communities c, ids where c.slug = 'test-other' $$,
  '42501', null, 'joining cannot set the state'
);
select throws_ok(
  $$ insert into public.members (community_id, user_id, username)
     select c.id, ids.bert, 'Bert' from public.communities c, ids where c.slug = 'test-other' $$,
  '42501', null, 'nobody can create an account for someone else'
);
select results_eq(
  $$ select private.is_approved(biking), private.is_community_admin(biking) from ids $$,
  $$ values (true, false) $$,
  'helpers: an approved member is not an admin'
);
select throws_ok(
  $$ insert into public.communities (slug, name, headline) values ('anna-world', 'x', 'x') $$,
  '42501', null, 'a member cannot create a community'
);

-- Carl, community admin ----------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', carl, 'role', 'authenticated')::text, true) from ids;
select results_eq(
  $$ select username from public.members m join ids on m.community_id = ids.biking
     where m.user_id in (ids.anna, ids.bert, ids.carl) or m.is_system order by username $$,
  $$ values ('Anna'::text), ('Bert'::text), ('Carl'::text), ('No-reply'::text) $$,
  'the community admin sees everyone, applicants included'
);
select ok((select private.is_community_admin(biking) from ids), 'helpers: the admin is a community admin');

-- Platform admin -----------------------------------------------------------------------------
reset role;
insert into public.platform_admins (user_id) select carl from ids;
set local role authenticated;
select lives_ok(
  $$ insert into public.communities (slug, name, headline) values ('carl-world', 'Carl World', 'x') $$,
  'the platform admin can create a community'
);

select * from finish();
rollback;
