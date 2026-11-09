begin;
create extension if not exists pgtap with schema extensions;

select plan(45);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'a1000000-0000-4000-8000-00000000000a'::uuid as anna, -- blocks Bert, then unblocks him
  'a1000000-0000-4000-8000-00000000000b'::uuid as bert,
  'a1000000-0000-4000-8000-00000000000e'::uuid as erik, -- community admin, blocked by Fred
  'a1000000-0000-4000-8000-00000000000f'::uuid as fred,
  'a1000000-0000-4000-8000-000000000001'::uuid as gina, -- joins directly
  'a1000000-0000-4000-8000-000000000002'::uuid as pat, -- platform admin
  'a1000000-0000-4000-8000-000000000003'::uuid as hank; -- first admin of a new community
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test', show_links = true, show_visibility = true;
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values
  (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.erik, 'erik'), (ids.fred, 'fred'), (ids.gina, 'gina')
) as u (id, name);
insert into auth.users (id, email) select pat, 'pat@test.invalid' from ids;
update public.members set state = 'approved', visible_in_search = true where user_id in (select unnest(array[anna, bert, erik, fred]) from ids);
update public.members set role = 'admin' where user_id = (select erik from ids);
-- Gina's profile is complete: a Status, and no required fields in the way.
update public.profile_fields set required = false where community_id = (select biking from ids);
update public.members set status_id = (
  select id from public.community_options where community_id = (select biking from ids) and list = 'status' and active order by position limit 1
) where user_id = (select gina from ids);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;

create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;

-- Unblock --------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.unblock(biking, bert) from ids $$, '42501', null, 'anon cannot unblock');
set local role authenticated;

select pg_temp.as_user(anna) from ids;
insert into saved select 'ab', public.open_dm(biking, bert) from ids;
select lives_ok($$ select public.leave_chat(biking, (select id from saved where name = 'ab'), 'keep') from ids $$, 'Anna blocks Bert ("Keep chat")');
select results_eq(
  $$ select user_id, username from public.my_blocks((select biking from ids)) $$,
  $$ select bert, 'Test bert' from ids $$,
  'Anna''s blocked people: Bert'
);
select pg_temp.as_user(bert) from ids;
select is_empty($$ select 1 from public.my_blocks((select biking from ids)) $$, 'Bert''s list is empty: nobody reads who blocked them');
select lives_ok($$ select public.unblock(biking, anna) from ids $$, 'Bert "unblocking" Anna does nothing');
reset role;
select is((select count(*)::int from public.blocks where blocker_id = (select anna from ids)), 1, 'Anna''s block stays');
set local role authenticated;

select pg_temp.as_user(anna) from ids;
select lives_ok($$ select public.unblock(biking, bert) from ids $$, 'Anna unblocks Bert');
select is_empty($$ select 1 from public.my_blocks((select biking from ids)) $$, 'her list is empty again');
select is((select h.blocked from ids, public.chat_header(ids.biking, (select id from saved where name = 'ab')) as h), false, 'the kept DM is open for writing again');
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'ab'), 'Test hello again') from ids $$, 'Anna writes in it');
select pg_temp.as_user(bert) from ids;
select isnt((select public.profile(biking, anna) from ids), null, 'Bert sees Anna''s profile again');
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'ab'), 'Test hi') from ids $$, 'and can answer');

-- Both blocked: unblocking one side leaves writing blocked.
select lives_ok($$ select public.leave_chat(biking, (select id from saved where name = 'ab'), 'keep') from ids $$, 'Bert blocks Anna');
select pg_temp.as_user(anna) from ids;
select lives_ok($$ select public.leave_chat(biking, (select id from saved where name = 'ab'), 'keep') from ids $$, 'and Anna blocks Bert');
select lives_ok($$ select public.unblock(biking, bert) from ids $$, 'Anna unblocks Bert');
select is((select h.blocked from ids, public.chat_header(ids.biking, (select id from saved where name = 'ab')) as h), true, 'Bert''s block still holds the DM');

-- The community admin sees a blocked person's ads and albums -----------------------------------
select pg_temp.as_user(fred) from ids;
insert into saved select 'fe', public.open_dm(biking, erik) from ids;
select lives_ok($$ select public.leave_chat(biking, (select id from saved where name = 'fe'), 'keep') from ids $$, 'Fred blocks the community admin');
reset role;
select pg_temp.as_user(erik) from ids;
select is((select private.can_see_ads(biking, fred) from ids), true, 'the admin still sees Fred''s ads');
select is((select private.can_see_albums(biking, fred) from ids), true, 'and his albums');
select pg_temp.as_user(fred) from ids;
select is((select private.can_see_ads(biking, erik) from ids), false, 'Fred (not an admin) doesn''t see the admin''s ads');
select pg_temp.as_user(anna) from ids;
select is((select private.can_see_ads(biking, bert) from ids), false, 'a blocked pair of members still don''t see each other''s ads');
select is((select private.can_see_albums(biking, bert) from ids), false, 'nor albums');
set local role authenticated;

-- Community settings ---------------------------------------------------------------------------
select pg_temp.as_user(fred) from ids;
select throws_ok(
  $$ select public.save_community_settings(biking, '{"application_text": "x", "require_app_image": true, "require_app_text": true, "require_app_names": true, "direct_join": true}') from ids $$,
  '42501', null, 'a member can''t change the settings'
);
select pg_temp.as_user(erik) from ids;
select throws_ok($$ select public.save_community_settings(biking, '{"direct_join": true}') from ids $$, '22023', null, 'incomplete settings are refused');
select lives_ok(
  $$ select public.save_community_settings(biking, '{"application_text": "  Test: say hi  ", "require_app_image": true, "require_app_text": false, "require_app_names": true, "direct_join": true}') from ids $$,
  'the admin saves the settings'
);
select results_eq(
  $$ select application_text, require_app_image, require_app_text, require_app_names, direct_join from public.communities where id = (select biking from ids) $$,
  $$ values ('Test: say hi'::text, true, false, true, true) $$,
  'they are stored, the text trimmed'
);

-- Direct join ----------------------------------------------------------------------------------
select pg_temp.as_user(gina) from ids;
select throws_ok($$ select public.submit_application(biking, '{"message": "Test hi"}') from ids $$, '23502', null, 'the real name is still asked for');
select lives_ok($$ select public.submit_application(biking, '{"real_name_1": "Test Gina"}') from ids $$, 'Gina joins without an image');
reset role;
select is((select state from public.members where community_id = (select biking from ids) and user_id = (select gina from ids)), 'approved', 'she is a member at once');
select is((select status from public.applications where community_id = (select biking from ids) and user_id = (select gina from ids)), 'approved', 'her application is approved');
select is((select real_name_1 from public.admin_records where scope_id = (select biking from ids) and user_id = (select gina from ids)), 'Test Gina', 'her real name is in the admin record');
set local role authenticated;

-- Platform admin -------------------------------------------------------------------------------
select pg_temp.as_user(erik) from ids;
select throws_ok($$ select public.create_community('test-new', 'Test New', '') $$, '42501', null, 'a community admin can''t create communities');
select is_empty($$ select 1 from public.platform_communities() $$, 'nor list them all');
reset role;
insert into public.platform_admins (user_id) select pat from ids;
set local role authenticated;
select pg_temp.as_user(pat) from ids;
select throws_ok($$ select public.create_community('platform', 'Test P', '') $$, '22023', null, 'a reserved address is refused');
select throws_ok($$ select public.create_community('Test new', 'Test P', '') $$, '22023', null, 'an address with spaces is refused');
select throws_ok($$ select public.create_community('biking-stockholm', 'Test P', '') $$, '23505', null, 'a taken address is refused');
insert into saved select 'new', public.create_community(' Test-New ', 'Test New', 'Test headline');
select is((select slug from public.communities where id = (select id from saved where name = 'new')), 'test-new', 'the platform admin creates a community (address lower-cased)');
select results_eq(
  $$ select members, admins from public.platform_communities() where id = (select id from saved where name = 'new') $$,
  $$ values (0, '{}'::text[]) $$,
  'it is listed with no members and no admin yet'
);

-- Hank signs up there; nobody can approve him yet, so the platform admin appoints him.
reset role;
update public.communities set privacy_version = 'test' where id = (select id from saved where name = 'new');
select is((select count(*)::int from public.members where community_id = (select id from saved where name = 'new') and is_system), 1, 'the new community has its No-reply account');
insert into auth.users (id, email, raw_user_meta_data)
select hank, 'hank@test.invalid', jsonb_build_object('community_id', (select id from saved where name = 'new'), 'username', 'Test hank', 'consents', '{"privacy": "test"}'::jsonb) from ids;
set local role authenticated;
select pg_temp.as_user(erik) from ids;
select throws_ok($$ select public.set_community_admin((select id from saved where name = 'new'), 'Test hank', true) $$, '42501', null, 'only the platform admin appoints community admins');
select pg_temp.as_user(pat) from ids;
select throws_ok($$ select public.set_community_admin((select id from saved where name = 'new'), 'Test nobody', true) $$, '22023', null, 'an unknown member is refused');
select lives_ok($$ select public.set_community_admin((select id from saved where name = 'new'), 'test HANK', true) $$, 'the platform admin appoints Hank');
reset role;
select results_eq(
  $$ select role, state from public.members where community_id = (select id from saved where name = 'new') and user_id = (select hank from ids) $$,
  $$ values ('admin'::text, 'approved'::text) $$,
  'Hank is the approved admin'
);
set local role authenticated;
select lives_ok($$ select public.set_community_admin((select id from saved where name = 'new'), 'Test hank', false) $$, 'and can make him a member again');
reset role;
select is((select role from public.members where community_id = (select id from saved where name = 'new') and user_id = (select hank from ids)), 'member', 'Hank is a member again');

select * from finish();
rollback;
