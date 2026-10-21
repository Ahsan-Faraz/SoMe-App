begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '80000000-0000-4000-8000-00000000000a'::uuid as anna, -- leaves her DM with Bert: "keep"
  '80000000-0000-4000-8000-00000000000b'::uuid as bert,
  '80000000-0000-4000-8000-00000000000c'::uuid as carl, -- leaves his DM with Dora: "delete"
  '80000000-0000-4000-8000-00000000000d'::uuid as dora,
  '80000000-0000-4000-8000-00000000000e'::uuid as erik, -- community admin
  '80000000-0000-4000-8000-00000000000f'::uuid as fred; -- not involved
grant select on ids to anon, authenticated;

-- Sign-ups give their consents (step 5b); every community's version is 'test' here.
update public.communities set privacy_version = 'test', show_links = true, show_visibility = true;
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values
  (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dora, 'dora'), (ids.erik, 'erik'), (ids.fred, 'fred')
) as u (id, name);
update public.members set state = 'approved', visible_in_search = true where user_id in (select unnest(array[anna, bert, carl, dora, erik, fred]) from ids);
update public.members set role = 'admin' where user_id = (select erik from ids);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;

create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;

-- Schema ---------------------------------------------------------------------------------------
select has_table('public', 'blocks', 'blocks table exists');

set local role anon;
select throws_ok($$ select public.leave_chat(biking, gen_random_uuid(), 'keep') from ids $$, '42501', null, 'anon cannot leave chats');
reset role;

-- Before any block -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;
insert into saved select 'ab', public.open_dm(biking, bert) from ids;
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'ab'), 'Test hello Bert') from ids $$, 'Anna writes to Bert');
select lives_ok($$ select public.set_profile_link(biking, bert, true) from ids $$, 'Anna links to Bert');
select pg_temp.as_user(bert) from ids;
select lives_ok($$ select public.set_profile_link(biking, anna, true) from ids $$, 'Bert links back');
select isnt((select public.profile(biking, anna) from ids), null, 'Bert sees Anna''s profile');
select is((select count(*)::int from public.profile_cards((select biking from ids), 100) where user_id = (select anna from ids)), 1, 'Anna is in Bert''s Profiles list');

-- "Keep chat, block writing" -------------------------------------------------------------------
select throws_ok($$ select public.leave_chat(biking, (select id from saved where name = 'ab'), 'later') from ids $$, '22023', null, 'an unknown way to leave is refused');
select pg_temp.as_user(fred) from ids;
select throws_ok($$ select public.leave_chat(biking, (select id from saved where name = 'ab'), 'keep') from ids $$, '42501', null, 'someone outside the chat cannot block through it');
select pg_temp.as_user(anna) from ids;
select lives_ok($$ select public.leave_chat(biking, (select id from saved where name = 'ab'), 'keep') from ids $$, 'Anna: "Keep chat, block writing"');
select results_eq(
  $$ select blocker_id, blocked_id from public.blocks $$,
  $$ select anna, bert from ids $$,
  'Anna has blocked Bert (and reads her own block)'
);
select throws_ok($$ insert into public.blocks (community_id, blocker_id, blocked_id) select biking, anna, fred from ids $$, '42501', null, 'blocks are not written directly');
select is((select h.blocked from ids, public.chat_header(ids.biking, (select id from saved where name = 'ab')) as h), true, 'her header says writing is blocked');
select throws_ok($$ select public.send_message(biking, (select id from saved where name = 'ab'), 'Test more') from ids $$, '42501', null, 'Anna can''t write any more');
select is((select count(*)::int from ids, public.list_messages(ids.biking, (select id from saved where name = 'ab'))), 1, 'the history stays');
select is((select count(*)::int from public.chat_list((select biking from ids))), 1, 'the chat stays in her list');

select pg_temp.as_user(bert) from ids;
select is_empty($$ select 1 from public.blocks $$, 'Bert can''t read who blocked him');
select throws_ok($$ select public.send_message(biking, (select id from saved where name = 'ab'), 'Test why?') from ids $$, '42501', null, 'Bert can''t write either');
select is((select h.blocked from ids, public.chat_header(ids.biking, (select id from saved where name = 'ab')) as h), true, 'his header says so too');
select is((select count(*)::int from ids, public.list_messages(ids.biking, (select id from saved where name = 'ab'))), 1, 'he keeps the history too');
select throws_ok($$ select public.open_dm(biking, anna) from ids $$, '42501', null, 'Bert can''t start a new DM with Anna');

-- Hidden from each other -----------------------------------------------------------------------
select is((select public.profile(biking, anna) from ids), null, 'Bert no longer sees Anna''s profile');
select is((select count(*)::int from public.profile_cards((select biking from ids), 100) where user_id = (select anna from ids)), 0, 'Anna is gone from Bert''s Profiles list');
select is_empty($$ select 1 from public.member_names((select biking from ids), 'Test anna') $$, 'and from his name search');
select throws_ok($$ select public.set_profile_link(biking, anna, true) from ids $$, '22023', null, 'he can''t link to her (answered like an unknown member)');
select pg_temp.as_user(anna) from ids;
select is((select public.profile(biking, bert) from ids), null, 'and Anna no longer sees Bert');
select is((select count(*)::int from public.profile_cards((select biking from ids), 100) where user_id = (select bert from ids)), 0, 'nor lists him');
select is((select jsonb_array_length(public.profile(biking, anna) -> 'links') from ids), 0, 'their profile links are removed');
select pg_temp.as_user(fred) from ids;
select isnt((select public.profile(biking, anna) from ids), null, 'others still see Anna');
select is((select count(*)::int from public.profile_cards((select biking from ids), 100) where user_id in (select unnest(array[anna, bert]) from ids)), 2, 'and list both');
select pg_temp.as_user(erik) from ids;
select isnt((select public.profile(biking, bert) from ids), null, 'the community admin still sees everyone');

-- "Delete chat, block user" --------------------------------------------------------------------
select pg_temp.as_user(carl) from ids;
insert into saved select 'cd', public.open_dm(biking, dora) from ids;
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'cd'), 'Test hi Dora') from ids $$, 'Carl writes to Dora');
select lives_ok($$ select public.leave_chat(biking, (select id from saved where name = 'cd'), 'delete') from ids $$, 'Carl: "Delete chat, block user"');
select is_empty($$ select 1 from public.chat_list((select biking from ids)) $$, 'the chat is gone from Carl''s list');
select pg_temp.as_user(dora) from ids;
select is_empty($$ select 1 from public.chat_list((select biking from ids)) $$, 'and from Dora''s: deleted for both');
select is_empty($$ select 1 from public.chat_header((select biking from ids), (select id from saved where name = 'cd')) $$, 'Dora can''t open it any more');
reset role;
select is((select count(*)::int from public.messages where chat_id = (select id from saved where name = 'cd')), 0, 'its messages are deleted');
select is((select count(*)::int from public.blocks where blocker_id = (select carl from ids) and blocked_id = (select dora from ids)), 1, 'and Dora is blocked');
set local role authenticated;
select pg_temp.as_user(dora) from ids;
select throws_ok($$ select public.open_dm(biking, carl) from ids $$, '42501', null, 'Dora can''t start a new DM with Carl');

-- A DM with someone else is not affected -------------------------------------------------------
select pg_temp.as_user(fred) from ids;
select lives_ok($$ select public.send_message(biking, public.open_dm(biking, anna), 'Test hi Anna') from ids $$, 'Fred can still DM Anna');

select * from finish();
rollback;
