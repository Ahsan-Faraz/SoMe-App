begin;
create extension if not exists pgtap with schema extensions;

select plan(59);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '90000000-0000-4000-8000-00000000000a'::uuid as anna, -- member: joins, posts
  '90000000-0000-4000-8000-00000000000b'::uuid as bert, -- member: applies, approved
  '90000000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  '90000000-0000-4000-8000-00000000000d'::uuid as dina, -- member: joins late (history off)
  '90000000-0000-4000-8000-00000000000e'::uuid as erik, -- member: blocked by Anna
  '90000000-0000-4000-8000-00000000000f'::uuid as gina; -- member: gets group-create rights, runs a group
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values
  (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dina, 'dina'), (ids.erik, 'erik'), (ids.gina, 'gina')
) as u (id, name);
update public.members set state = 'approved' where user_id in (select unnest(array[anna, bert, carl, dina, erik, gina]) from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);
insert into public.blocks (community_id, blocker_id, blocked_id) select biking, anna, erik from ids;

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.group_json(p_name text, p_extra jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'name', p_name, 'headline', 'Test rides', 'application_text', 'Tell us how you ride',
    'state_labels', jsonb_build_array('Paid', '', 'Locker'),
    'infos', jsonb_build_array(jsonb_build_object('headline', 'Rules', 'body', 'Be kind'), jsonb_build_object('headline', ' ', 'body', 'x'),
      jsonb_build_object('headline', 'Route', 'body', '42 km'))
  ) || p_extra
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.group_json(text, jsonb) to anon, authenticated;

create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;

-- Schema ---------------------------------------------------------------------------------------
select has_table('public', 'group_info_posts', 'group_info_posts table exists');
select has_column('public', 'chats', 'direct_join', 'groups have their settings on chats');

set local role anon;
select throws_ok($$ select public.save_group(biking, null, pg_temp.group_json('Test X')) from ids $$, '42501', null, 'anon cannot create groups');
reset role;

-- Creating ---------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(gina) from ids;
select throws_ok($$ select public.save_group(biking, null, pg_temp.group_json('Test Gina')) from ids $$, '42501', null, 'a member without rights can''t create a group');
select throws_ok($$ select public.set_group_rights(biking, gina, true) from ids $$, '42501', null, 'members can''t give themselves group-create rights');
select pg_temp.as_user(carl) from ids;
select throws_ok($$ select public.save_group(biking, null, '{"name": " "}') from ids $$, '23502', null, 'a group needs a name');
insert into saved select 'open', public.save_group(biking, null, pg_temp.group_json('Test Open', '{"direct_join": true, "member_list": true}')) from ids;
select isnt((select id from saved where name = 'open'), null, 'the community admin creates a group');
select lives_ok($$ select public.set_group_rights(biking, gina, true) from ids $$, 'and gives Gina group-create rights');
select pg_temp.as_user(gina) from ids;
insert into saved select 'gravel', public.save_group(biking, null,
  pg_temp.group_json('Test Gravel', '{"direct_join": false, "history": false, "member_list": false, "require_app_text": true}')) from ids;
select isnt((select id from saved where name = 'gravel'), null, 'with the rights, Gina creates a group too');
select results_eq(
  $$ select g ->> 'role', (g ->> 'manage')::boolean, jsonb_array_length(g -> 'infos'), g -> 'infos' -> 1 ->> 'n'
     from (select public.group_info(biking, (select id from saved where name = 'gravel')) as g from ids) as x $$,
  $$ values ('admin'::text, true, 2, '3'::text) $$,
  'the creator is its group admin; infos without a headline are not stored, the others keep their place'
);
select results_eq(
  $$ select g -> 'state_labels', g ->> 'application_text', (g ->> 'history')::boolean
     from (select public.group_settings(biking, (select id from saved where name = 'gravel')) as g from ids) as x $$,
  $$ values ('["Paid", null, "Locker"]'::jsonb, 'Tell us how you ride'::text, false) $$,
  'every setting is saved (an empty label is no label)'
);

-- Editing ----------------------------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select public.save_group(biking, (select id from saved where name = 'gravel'), pg_temp.group_json('Hacked')) from ids $$,
  '42501', null, 'a member can''t edit the group');
select is((select public.group_settings(biking, (select id from saved where name = 'gravel')) from ids), null, 'nor read its settings');
select pg_temp.as_user(carl) from ids;
select lives_ok($$ select public.save_group(biking, (select id from saved where name = 'gravel'),
  pg_temp.group_json('Test Gravel Ride', '{"direct_join": false, "history": false, "member_list": false}')) from ids $$,
  'the community admin can edit any group');

-- Finding and joining ----------------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select results_eq(
  $$ select name, direct_join from public.group_directory((select biking from ids)) where chat_id in (select id from saved) $$,
  $$ values ('Test Gravel Ride'::text, false), ('Test Open', true) $$,
  '"Find new group" lists the groups she is not in, by name'
);
select throws_ok($$ select public.join_group(biking, (select id from saved where name = 'gravel')) from ids $$, '42501', null, 'a group without direct join can''t be joined directly');
select lives_ok($$ select public.join_group(biking, (select id from saved where name = 'open')) from ids $$, 'Anna joins the open group');
select is((select count(*)::int from public.group_directory((select biking from ids)) where name = 'Test Open'), 0, 'it leaves her "Find new group"');
select is((select count(*)::int from public.chat_list((select biking from ids)) where name = 'Test Open'), 1, 'and is in her chats');
select pg_temp.as_user(erik) from ids;
select lives_ok($$ select public.join_group(biking, (select id from saved where name = 'open')) from ids $$, 'Erik joins too');
select pg_temp.as_user(anna) from ids;
select is(
  (select count(*)::int from jsonb_array_elements((select public.group_info(biking, (select id from saved where name = 'open')) -> 'members' from ids)) as m
   where m ->> 'username' = 'Test erik'),
  0, 'the member list leaves out someone she blocked'
);

-- Applying -----------------------------------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
select results_eq(
  $$ select g ->> 'application_text', (g -> 'requires' ->> 'text')::boolean, (g ->> 'applied')::boolean
     from (select public.group_card(biking, (select id from saved where name = 'gravel')) as g from ids) as x $$,
  $$ values ('Tell us how you ride'::text, true, false) $$,
  'A24 shows the group''s application text and what it asks for'
);
select throws_ok($$ select public.apply_to_group(biking, (select id from saved where name = 'gravel'), '{}') from ids $$, '23502', null, 'the text the group asks for must be there');
insert into saved select 'bert_app', public.apply_to_group(biking, (select id from saved where name = 'gravel'), '{"message": "Test I ride gravel", "real_name_1": "Bert Berg"}') from ids;
select isnt((select id from saved where name = 'bert_app'), null, 'Bert applies');
select throws_ok($$ select public.apply_to_group(biking, (select id from saved where name = 'gravel'), '{"message": "again"}') from ids $$, '23505', null, 'once while it is open');
select is((select (public.group_card(biking, (select id from saved where name = 'gravel')) ->> 'applied')::boolean from ids), true, 'the card now says he has applied');
select is_empty($$ select 1 from public.group_roster((select biking from ids), (select id from saved where name = 'gravel'), true) $$, 'a member gets no application queue');
select throws_ok($$ select public.decide_application((select id from saved where name = 'bert_app'), 'approved') $$, '42501', null, 'nor decides his own application');

-- The group admin decides --------------------------------------------------------------------------
select pg_temp.as_user(gina) from ids;
select results_eq(
  $$ select username, message, real_name_1 from public.group_roster((select biking from ids), (select id from saved where name = 'gravel'), true) $$,
  $$ values ('Test bert'::text, 'Test I ride gravel'::text, 'Bert Berg'::text) $$,
  'the group admin''s queue (A23) has the application, with the real name'
);
select is((select public.group_member(biking, (select id from saved where name = 'gravel'), bert) -> 'application' ->> 'message' from ids), 'Test I ride gravel',
  'A22 shows his application');
select lives_ok($$ select public.decide_application((select id from saved where name = 'bert_app'), 'approved') $$, 'Gina approves');
select is((select count(*)::int from public.group_roster((select biking from ids), (select id from saved where name = 'gravel'), false) where username = 'Test bert'), 1,
  'Bert is a member now');
select is((select real_name_1 from public.group_roster((select biking from ids), (select id from saved where name = 'gravel'), false) where username = 'Test bert'), 'Bert Berg',
  'with his real name in the group''s record');
select lives_ok($$ select public.save_group_record(biking, (select id from saved where name = 'gravel'), bert, '{"state_1": "150", "notes": "Paid cash"}') from ids $$,
  'the group admin keeps the group''s record of him');
select pg_temp.as_user(bert) from ids;
select results_eq(
  $$ select name, preview from public.chat_list((select biking from ids)) where name = 'No-reply' $$,
  $$ values ('No-reply'::text, 'You are now a member of Test Gravel Ride.'::text) $$,
  'the No-reply account tells Bert in a DM'
);
select throws_ok(
  $$ select public.send_message(biking, (select chat_id from public.chat_list((select biking from ids)) where name = 'No-reply'), 'Thanks!') from ids $$,
  '42501', null, 'nobody can answer No-reply'
);
select pg_temp.as_user(carl) from ids;
select is_empty($$ select 1 from public.admin_records where scope_id = (select id from saved where name = 'gravel') $$,
  'the community''s admin records never include a group''s (read through the group''s own screens)');

-- History off --------------------------------------------------------------------------------------
select pg_temp.as_user(gina) from ids;
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'gravel'), 'Test before Dina') from ids $$, 'Gina posts before Dina joins');
select lives_ok($$ select public.set_group_member(biking, (select id from saved where name = 'gravel'), dina, true) from ids $$, 'Gina adds Dina (A30 +)');
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'gravel'), 'Test after Dina') from ids $$, 'and posts again');
select pg_temp.as_user(dina) from ids;
select results_eq(
  $$ select body from public.list_messages((select biking from ids), (select id from saved where name = 'gravel')) $$,
  $$ values ('Test after Dina'::text) $$,
  'with history off, Dina sees only what was posted after she joined'
);
select pg_temp.as_user(bert) from ids;
select is((select count(*)::int from public.list_messages((select biking from ids), (select id from saved where name = 'gravel')) where body like 'Test %'), 2,
  'Bert (joined earlier) sees both');

-- Member list off ------------------------------------------------------------------------------------
select is((select public.group_info(biking, (select id from saved where name = 'gravel')) -> 'members' from ids), 'null'::jsonb, 'with the member list off, members get no list');
select is((select public.group_info(biking, (select id from saved where name = 'gravel')) -> 'member_count' from ids), 'null'::jsonb, 'and no count');
select pg_temp.as_user(gina) from ids;
select is((select (public.group_info(biking, (select id from saved where name = 'gravel')) ->> 'member_count')::int from ids), 3, 'the group admin still sees them (3 members)');

-- Posting off --------------------------------------------------------------------------------------
select lives_ok($$ select public.save_group(biking, (select id from saved where name = 'gravel'),
  pg_temp.group_json('Test Gravel Ride', '{"history": false, "member_list": false, "allow_posting": false}')) from ids $$, 'Gina switches posting off');
select pg_temp.as_user(bert) from ids;
select is((select h.can_post from ids, public.chat_header(ids.biking, (select id from saved where name = 'gravel')) as h), false, 'Bert''s chat shows no message box');
select throws_ok($$ select public.send_message(biking, (select id from saved where name = 'gravel'), 'Test hi') from ids $$, '42501', null, 'and the database refuses his post');
select pg_temp.as_user(gina) from ids;
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'gravel'), 'Test admins may post') from ids $$, 'the group admin may still post');
select is((select h.info_headline from ids, public.chat_header(ids.biking, (select id from saved where name = 'gravel')) as h), 'Rules', 'the info bar shows Info 1''s headline');

-- Members, admins, rights ------------------------------------------------------------------------------
select throws_ok($$ select public.set_group_member(biking, (select id from saved where name = 'gravel'), gina, false) from ids $$, '42501', null, 'the group admin can''t be taken out');
select throws_ok($$ select public.set_group_admin(biking, (select id from saved where name = 'gravel'), bert) from ids $$, '42501', null, 'only the community admin sets the group admin');
select results_eq(
  $$ select g ->> 'name', (g ->> 'member')::boolean from jsonb_array_elements((select public.group_assignments(biking, dina) -> 'groups' from ids)) as g $$,
  $$ values ('Test Gravel Ride'::text, true) $$,
  'F1 for a group admin: only her own groups'
);
select pg_temp.as_user(carl) from ids;
select lives_ok($$ select public.set_group_admin(biking, (select id from saved where name = 'gravel'), bert) from ids $$, 'the community admin makes Bert the group admin');
select results_eq(
  $$ select m ->> 'username', (m ->> 'admin')::boolean
     from jsonb_array_elements((select public.group_info(biking, (select id from saved where name = 'gravel')) -> 'members' from ids)) as m
     where m ->> 'username' in ('Test bert', 'Test gina') $$,
  $$ values ('Test bert'::text, true), ('Test gina', false) $$,
  'one admin per group: Gina stays a member'
);
select ok((select count(*) >= 2 from jsonb_array_elements((select public.group_assignments(biking, dina) -> 'groups' from ids))), 'F1 for the community admin: every group');

-- Deleting -----------------------------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select public.delete_group(biking, (select id from saved where name = 'open')) from ids $$, '42501', null, 'a member can''t delete a group');
select pg_temp.as_user(carl) from ids;
select lives_ok($$ select public.delete_group(biking, (select id from saved where name = 'gravel')) from ids $$, 'the community admin deletes Gravel');
reset role;
select is((select count(*)::int from public.chats where id = (select id from saved where name = 'gravel')), 0, 'the group, its messages and members are gone');

select * from finish();
rollback;
