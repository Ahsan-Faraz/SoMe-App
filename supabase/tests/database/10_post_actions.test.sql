begin;
create extension if not exists pgtap with schema extensions;

select plan(47);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'a0000000-0000-4000-8000-00000000000a'::uuid as anna, -- member: posts
  'a0000000-0000-4000-8000-00000000000b'::uuid as bert, -- member
  'a0000000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin, runs the group
  'a0000000-0000-4000-8000-00000000000e'::uuid as erik; -- member, not in the group
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.erik, 'erik')) as u (id, name);
update public.members set state = 'approved' where user_id in (select unnest(array[anna, bert, carl, erik]) from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;
create temp table saved (name text primary key, id uuid, n bigint);
grant all on saved to authenticated;

-- A chat image's files in Anna's folder of the private bucket.
insert into storage.objects (bucket_id, name)
select 'private', ids.biking || '/' || ids.anna || '/a0000000-0000-4000-8000-0000000000f1' || s.suffix
from ids cross join (values ('.webp'), ('_t.webp')) as s (suffix);

-- The group, run by Carl (community admin); Anna and Bert in it.
set local role authenticated;
select pg_temp.as_user(carl) from ids;
insert into saved (name, id) select 'g', public.save_group(biking, null, '{"name": "Test Posts", "allow_commenting": true, "allow_reactions": true, "allow_post_editing": true}') from ids;
select public.set_group_member(biking, (select id from saved where name = 'g'), u, true) from ids, unnest(array[anna, bert]) as u;
reset role;

-- Schema ---------------------------------------------------------------------------------------
select has_table('public', 'reactions', 'reactions table exists');
select has_column('public', 'messages', 'photo_id', 'a post can have a photo');

set local role anon;
select throws_ok($$ select public.set_reaction(biking, gen_random_uuid(), 1, '👍') from ids $$, '42501', null, 'anon cannot react');
reset role;

-- Posting with a photo -------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select public.send_message(biking, (select id from saved where name = 'g'), '  ') from ids $$, '22023', null, 'a post needs text or a photo');
insert into saved (name, n) select 'photo', (public.send_message(biking, (select id from saved where name = 'g'), null, null, null, jsonb_build_object(
  'path', biking || '/' || anna || '/a0000000-0000-4000-8000-0000000000f1.webp',
  'thumb_path', biking || '/' || anna || '/a0000000-0000-4000-8000-0000000000f1_t.webp',
  'width', 1600, 'height', 900, 'taken_in_app', true)) ->> 'seq')::bigint from ids;
select is((select n from saved where name = 'photo'), 1::bigint, 'Anna posts a photo without text');
select results_eq(
  $$ select body, photo ->> 'width', (photo ->> 'taken_in_app')::boolean from public.list_messages((select biking from ids), (select id from saved where name = 'g')) $$,
  $$ values (null::text, '1600'::text, true) $$,
  'the post shows the photo (paths to sign, size, Taken in app)'
);
select is((select preview from public.chat_list((select biking from ids)) where name = 'Test Posts'), 'Test anna: 📷 Photo', 'the chat list says it is a photo');

-- Who may open the image -------------------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
select ok(private.can_read_chat_photo((select biking || '/' || anna || '/a0000000-0000-4000-8000-0000000000f1_t.webp' from ids)), 'a member can read the image (to sign a link)');
select pg_temp.as_user(erik) from ids;
select ok(not private.can_read_chat_photo((select biking || '/' || anna || '/a0000000-0000-4000-8000-0000000000f1_t.webp' from ids)), 'someone outside the group can''t');
select ok(not private.can_read_chat_photo('anything/else.webp'), 'nor any other file');

-- Reactions (one per person, changeable) ----------------------------------------------------------
select pg_temp.as_user(anna) from ids;
insert into saved (name, n) select 'post', (public.send_message(biking, (select id from saved where name = 'g'), 'Test Sunday ride?') ->> 'seq')::bigint from ids;
select throws_ok($$ select public.set_reaction(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post'), 'abc') from ids $$, '23514', null, 'a reaction is an emoji');
select is((select public.set_reaction(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post'), '👍') from ids), '{"👍": 1}'::jsonb, 'Anna reacts 👍');
select is((select public.set_reaction(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post'), '❤️') from ids), '{"❤️": 1}'::jsonb, 'reacting again changes her one reaction');
select pg_temp.as_user(bert) from ids;
select is((select public.set_reaction(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post'), '👍') from ids), '{"👍": 1, "❤️": 1}'::jsonb, 'Bert adds 👍');
select results_eq(
  $$ select reactions, my_reaction from public.list_messages((select biking from ids), (select id from saved where name = 'g')) where seq = (select n from saved where name = 'post') $$,
  $$ values ('{"👍": 1, "❤️": 1}'::jsonb, '👍'::text) $$,
  'a page carries the counts and Bert''s own reaction'
);
select results_eq(
  $$ select username, emoji from public.reaction_details((select biking from ids), (select id from saved where name = 'g'), (select n from saved where name = 'post')) $$,
  $$ values ('Test anna'::text, '❤️'::text), ('Test bert', '👍') $$,
  '"Details": who reacted, with what'
);
select pg_temp.as_user(anna) from ids;
select is((select public.set_reaction(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post'), null) from ids), '{"👍": 1}'::jsonb, 'taking it back removes it from the counts');
select pg_temp.as_user(erik) from ids;
select throws_ok($$ select public.set_reaction(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post'), '👍') from ids $$, '42501', null, 'someone outside the chat can''t react');
select is_empty($$ select 1 from public.reaction_details((select biking from ids), (select id from saved where name = 'g'), (select n from saved where name = 'post')) $$, 'nor see who reacted');

-- Comments -------------------------------------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
insert into saved (name, n) select 'comment', (public.send_message(biking, (select id from saved where name = 'g'), 'Test yes, 9:00', null, (select n from saved where name = 'post')) ->> 'seq')::bigint from ids;
select results_eq(
  $$ select reply_to_seq, reply_author, reply_snippet from public.list_messages((select biking from ids), (select id from saved where name = 'g')) where seq = (select n from saved where name = 'comment') $$,
  $$ select n, 'Test anna'::text, 'Test Sunday ride?'::text from saved where name = 'post' $$,
  'a comment shows a snippet of the post it answers'
);
select pg_temp.as_user(anna) from ids;
insert into saved (name, n) select 'nested', (public.send_message(biking, (select id from saved where name = 'g'), 'Test great', null, (select n from saved where name = 'comment')) ->> 'seq')::bigint from ids;
select throws_ok($$ select public.send_message(biking, (select id from saved where name = 'g'), 'Test x', null, 9999) from ids $$, '22023', null, 'no comment on a post that isn''t there');

-- Editing ---------------------------------------------------------------------------------------------
select lives_ok($$ select public.edit_message(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post'), ' Test Sunday ride at 9? ') from ids $$, 'Anna edits her post');
select results_eq(
  $$ select body, edited_at is not null from public.list_messages((select biking from ids), (select id from saved where name = 'g')) where seq = (select n from saved where name = 'post') $$,
  $$ values ('Test Sunday ride at 9?'::text, true) $$,
  'the new text, marked edited'
);
select throws_ok($$ select public.edit_message(biking, (select id from saved where name = 'g'), (select n from saved where name = 'comment'), 'Hacked') from ids $$, '42501', null, 'nobody edits someone else''s post');
select throws_ok($$ select public.edit_message(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post'), ' ') from ids $$, '22023', null, 'a post without a photo keeps some text');

-- Group switches ----------------------------------------------------------------------------------------
select pg_temp.as_user(carl) from ids;
select lives_ok($$ select public.save_group(biking, (select id from saved where name = 'g'), '{"name": "Test Posts", "allow_commenting": false, "allow_reactions": false, "allow_post_editing": false}') from ids $$,
  'Carl switches commenting, reactions and editing off');
select pg_temp.as_user(bert) from ids;
select throws_ok($$ select public.set_reaction(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post'), '🎉') from ids $$, '42501', null, 'reactions off: refused');
select throws_ok($$ select public.send_message(biking, (select id from saved where name = 'g'), 'Test c', null, (select n from saved where name = 'post')) from ids $$, '42501', null, 'commenting off: refused');
select throws_ok($$ select public.edit_message(biking, (select id from saved where name = 'g'), (select n from saved where name = 'comment'), 'Test edit') from ids $$, '42501', null, 'editing off: refused');
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'g'), 'Test plain post') from ids $$, 'posting is still on');
select results_eq(
  $$ select allow_commenting, allow_reactions, allow_post_editing from public.chat_header((select biking from ids), (select id from saved where name = 'g')) $$,
  $$ values (false, false, false) $$,
  'the chat header tells Bert''s screen what is off'
);
select pg_temp.as_user(carl) from ids;
select lives_ok($$ select public.set_reaction(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post'), '🎉') from ids $$, 'the group''s admin may still react');
select results_eq(
  $$ select allow_commenting, allow_reactions, allow_post_editing from public.chat_header((select biking from ids), (select id from saved where name = 'g')) $$,
  $$ values (true, true, true) $$,
  'and their header says so'
);

-- Deleting ----------------------------------------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
select throws_ok($$ select public.delete_message(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post')) from ids $$, '42501', null, 'a member can''t delete someone else''s post');
select pg_temp.as_user(anna) from ids;
select is(
  (select jsonb_array_length(public.delete_message(biking, (select id from saved where name = 'g'), (select n from saved where name = 'post')) -> 'files') from ids),
  0, 'Anna deletes her post (no image files)'
);
select is_empty(
  $$ select 1 from public.list_messages((select biking from ids), (select id from saved where name = 'g')) where seq in (select n from saved where name in ('post', 'comment', 'nested')) $$,
  'its comment and the comment on that are gone too'
);
reset role;
select is((select count(*)::int from public.reactions where seq = (select n from saved where name = 'post') and chat_id = (select id from saved where name = 'g')), 0, 'and its reactions');
set local role authenticated;
select pg_temp.as_user(carl) from ids;
select is(
  (select jsonb_array_length(public.delete_message(biking, (select id from saved where name = 'g'), (select n from saved where name = 'photo')) -> 'files') from ids),
  2, 'the group''s admin deletes Anna''s photo post; both image files are returned for deletion'
);
reset role;
select is((select count(*)::int from public.photos where owner_id = (select anna from ids) and purpose = 'chat'), 0, 'the photo row is gone');
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select is((select preview from public.chat_list((select biking from ids)) where name = 'Test Posts'), 'Test bert: Test plain post', 'the chat list shows the newest post that is left');

-- In a DM ------------------------------------------------------------------------------------------
insert into saved (name, id) select 'dm', public.open_dm(biking, bert) from ids;
insert into saved (name, n) select 'dm1', (public.send_message(biking, (select id from saved where name = 'dm'), 'Test hi') ->> 'seq')::bigint from ids;
select pg_temp.as_user(bert) from ids;
select lives_ok($$ select public.set_reaction(biking, (select id from saved where name = 'dm'), (select n from saved where name = 'dm1'), '👋') from ids $$, 'in a DM both can react');
select throws_ok($$ select public.delete_message(biking, (select id from saved where name = 'dm'), (select n from saved where name = 'dm1')) from ids $$, '42501', null, 'but only delete their own posts');
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'dm'), 'Test 👋 back', null, (select n from saved where name = 'dm1')) from ids $$, 'and comment');
select pg_temp.as_user(anna) from ids;
select lives_ok($$ select public.leave_chat(biking, (select id from saved where name = 'dm'), 'keep') from ids $$, 'Anna blocks Bert (keep chat)');
select pg_temp.as_user(bert) from ids;
select throws_ok($$ select public.set_reaction(biking, (select id from saved where name = 'dm'), (select n from saved where name = 'dm1'), '😢') from ids $$, '42501', null, 'after a block nobody can react');
select throws_ok($$ select public.edit_message(biking, (select id from saved where name = 'dm'), (select n from saved where name = 'dm1') + 1, 'Test edit') from ids $$, '42501', null, 'or edit');
select is((select public.leave_chat(biking, (select id from saved where name = 'dm'), 'delete') ->> 'files' from ids), '[]', 'deleting a DM returns its image files (none here)');

select * from finish();
rollback;
