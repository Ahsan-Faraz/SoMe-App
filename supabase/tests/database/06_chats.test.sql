begin;
create extension if not exists pgtap with schema extensions;

select plan(64);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '60000000-0000-4000-8000-00000000000a'::uuid as anna, -- approved member
  '60000000-0000-4000-8000-00000000000b'::uuid as bert, -- approved member
  '60000000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  '60000000-0000-4000-8000-00000000000d'::uuid as dina, -- applicant
  '60000000-0000-4000-8000-00000000000e'::uuid as erik, -- approved member, in no chat with Anna
  '60000000-0000-4000-8000-00000000000f'::uuid as olga; -- member of another community only
grant select on ids to anon, authenticated;

insert into public.communities (slug, name, headline) values ('test-other-chats', 'Other', 'Another community');

-- Sign-ups give their consents (step 5b); every community's version is 'test' here.
update public.communities set privacy_version = 'test';

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', case when u.name = 'olga' then (select id from public.communities where slug = 'test-other-chats') else ids.biking end,
    'username', initcap(u.name), 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values
  (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dina, 'dina'), (ids.erik, 'erik'), (ids.olga, 'olga')
) as u (id, name);

update public.members set state = 'approved' where user_id in (select unnest(array[anna, bert, erik, olga]) from ids);
update public.members set state = 'approved', role = 'admin' where user_id = (select carl from ids);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;

create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;

-- Schema ---------------------------------------------------------------------------------------
select has_table('public', 'chats', 'chats table exists');
select has_table('public', 'chat_members', 'chat_members table exists');
select has_table('public', 'messages', 'messages table exists');

-- Anonymous ------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.chat_list(biking) from ids $$, '42501', null, 'anon cannot list chats');
select throws_ok($$ select public.send_message(biking, gen_random_uuid(), 'Hi') from ids $$, '42501', null, 'anon cannot send');
select throws_ok($$ select 1 from public.messages $$, '42501', null, 'anon cannot read messages');
reset role;

-- Opening a DM ---------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select 1 from public.chats $$, '42501', null, 'chats are not readable directly');
select throws_ok($$ select 1 from public.messages $$, '42501', null, 'messages are not readable directly');
select throws_ok($$ insert into public.messages (chat_id, seq, community_id, author_id, body) select gen_random_uuid(), 1, biking, anna, 'x' from ids $$,
  '42501', null, 'messages cannot be written directly');
select throws_ok($$ select public.open_dm(biking, anna) from ids $$, '22023', null, 'no DM with yourself');
select throws_ok($$ select public.open_dm(biking, dina) from ids $$, '22023', null, 'a member cannot DM an applicant');
select throws_ok($$ select public.open_dm(biking, olga) from ids $$, '22023', null, 'no DM with someone of another community');
select is((select public.find_dm(biking, bert) from ids), null, 'no DM with Bert yet');
insert into saved select 'ab', public.open_dm(biking, bert) from ids;
select isnt((select id from saved where name = 'ab'), null, 'Anna opens a DM with Bert');
select is((select public.open_dm(biking, bert) from ids), (select id from saved where name = 'ab'), 'opening it again finds the same DM');
select is((select public.find_dm(biking, bert) from ids), (select id from saved where name = 'ab'), 'find_dm finds it');
select results_eq(
  $$ select name, unread, preview from public.chat_list((select biking from ids)) $$,
  $$ values ('Bert'::text, 0::bigint, null::text) $$,
  'the empty DM is in the list of the one who opened it, named after the other person'
);

select pg_temp.as_user(bert) from ids;
select is_empty($$ select 1 from public.chat_list((select biking from ids)) $$, 'an empty DM is not in the other person''s list');
select is((select public.open_dm(biking, anna) from ids), (select id from saved where name = 'ab'), 'Bert opening a DM with Anna gets the same chat');

-- Sending --------------------------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select public.send_message(biking, (select id from saved where name = 'ab'), E'  \n ') from ids $$, '22023', null, 'an empty message is refused');
select throws_ok($$ select public.send_message(biking, (select id from saved where name = 'ab'), repeat('x', 8001)) from ids $$, '23514', null, 'a message is at most 8,000 characters');
select is(
  (select (public.send_message(biking, (select id from saved where name = 'ab'), E'\n  Hi Bert!\nRide on Sunday?  \n', '60000000-0000-4000-8000-0000000000c1') ->> 'seq')::int from ids),
  1, 'Anna sends the first message: number 1'
);
select is(
  (select (public.send_message(biking, (select id from saved where name = 'ab'), 'Hi Bert!', '60000000-0000-4000-8000-0000000000c1') ->> 'seq')::int from ids),
  1, 'a retry with the same client id returns the first send'
);
select results_eq(
  $$ select seq::int, author_name, body from public.list_messages((select biking from ids), (select id from saved where name = 'ab')) $$,
  $$ values (1, 'Anna'::text, E'Hi Bert!\nRide on Sunday?'::text) $$,
  'saved once, trimmed (spaces and line breaks), line breaks inside kept'
);
select results_eq(
  $$ select unread, preview from public.chat_list((select biking from ids)) $$,
  $$ values (0::bigint, 'Hi Bert! Ride on Sunday?'::text) $$,
  'your own message is read; the preview is one line'
);
reset role;
-- realtime.send stores the broadcast in realtime.messages, partitioned by day. Realtime makes each
-- day's partition while phones are connected; without today's a send still works but its broadcast
-- is not stored (the function only warns), so these two check it whenever today's partition exists.
create temp table broadcasts as
select count(*)::int as n, max(payload ->> 'body') as body,
  exists (
    select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'realtime.messages'::regclass and c.relname = 'messages_' || to_char(now() at time zone 'utc', 'YYYY_MM_DD')
  ) as live
from realtime.messages
where topic = 'chat:' || (select id from saved where name = 'ab') and event = 'message' and private;
select ok((select not live or n = 1 from broadcasts), 'the send was broadcast once, privately, on the chat''s channel');
select ok((select not live or body = E'Hi Bert!\nRide on Sunday?' from broadcasts), 'the broadcast carries the saved message');
set local role authenticated;

select pg_temp.as_user(bert) from ids;
select results_eq(
  $$ select name, unread from public.chat_list((select biking from ids)) $$,
  $$ values ('Anna'::text, 1::bigint) $$,
  'Bert now has the DM, with 1 unread'
);
select results_eq(
  $$ select kind, name, other_user_id, last_seq::int, last_read_seq::int from public.chat_header((select biking from ids), (select id from saved where name = 'ab')) $$,
  $$ select 'dm'::text, 'Anna'::text, anna, 1, 0 from ids $$,
  'Bert''s header: the DM with Anna, 1 message, none read'
);
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'ab'), 'Yes!') from ids $$, 'Bert answers');
select is((select unread from public.chat_list((select biking from ids))), 0::bigint, 'sending marks the chat read up to your message');

-- Unread and marking read ----------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select lives_ok($$
  select public.send_message(biking, (select id from saved where name = 'ab'), 'Message ' || n) from ids, generate_series(3, 8) as n
$$, 'Anna sends 6 more (up to number 8)');
select pg_temp.as_user(bert) from ids;
select is((select unread from public.chat_list((select biking from ids))), 6::bigint, 'Bert has 6 unread');
select lives_ok($$ select public.mark_read(biking, (select id from saved where name = 'ab'), 5) from ids $$, 'Bert reads up to 5');
select is((select unread from public.chat_list((select biking from ids))), 3::bigint, '3 left unread');
select lives_ok($$ select public.mark_read(biking, (select id from saved where name = 'ab'), 2) from ids $$, 'an older mark');
select is((select unread from public.chat_list((select biking from ids))), 3::bigint, 'never moves the mark back');
select lives_ok($$ select public.mark_read(biking, (select id from saved where name = 'ab'), 999) from ids $$, 'a mark past the end');
select is((select h.last_read_seq::int from ids, public.chat_header(ids.biking, (select id from saved where name = 'ab')) as h), 8, 'stops at the last message');

-- Paging ---------------------------------------------------------------------------------------
select results_eq(
  $$ select seq::int from public.list_messages((select biking from ids), (select id from saved where name = 'ab'), null, null, 3) $$,
  $$ values (8), (7), (6) $$, 'the newest page, newest first'
);
select results_eq(
  $$ select seq::int from public.list_messages((select biking from ids), (select id from saved where name = 'ab'), 6, null, 3) $$,
  $$ values (5), (4), (3) $$, 'the page before 6: no overlap, no gap'
);
select results_eq(
  $$ select seq::int from public.list_messages((select biking from ids), (select id from saved where name = 'ab'), null, 6, 30) $$,
  $$ values (8), (7) $$, 'catching up after 6 (a reconnect)'
);
select is((select count(*)::int from ids, public.list_messages(ids.biking, (select id from saved where name = 'ab'), null, null, 1000)), 8, 'a page is capped and complete');

-- Order of the list: unread first, then newest -------------------------------------------------
select pg_temp.as_user(carl) from ids;
insert into saved select 'cb', public.open_dm(biking, bert) from ids;
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'cb'), 'Welcome, Bert') from ids $$, 'Carl writes to Bert');
select pg_temp.as_user(anna) from ids;
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'ab'), 'Newest message') from ids $$, 'then Anna writes again (newer)');
select pg_temp.as_user(bert) from ids;
select lives_ok($$ select public.mark_read(biking, (select id from saved where name = 'ab'), 9) from ids $$, 'Bert reads Anna''s');
select results_eq(
  $$ select name, unread from public.chat_list((select biking from ids)) $$,
  $$ values ('Carl'::text, 1::bigint), ('Anna', 0) $$,
  'the unread chat comes first, although Anna''s is newer'
);

-- Outsiders get nothing ------------------------------------------------------------------------
select pg_temp.as_user(erik) from ids;
select is_empty($$ select 1 from public.list_messages((select biking from ids), (select id from saved where name = 'ab')) $$, 'a non-member reads no messages');
select is_empty($$ select 1 from public.chat_header((select biking from ids), (select id from saved where name = 'ab')) $$, 'a non-member gets no header');
select throws_ok($$ select public.send_message(biking, (select id from saved where name = 'ab'), 'Hi') from ids $$, '42501', null, 'a non-member cannot send');
select lives_ok($$ select public.mark_read(biking, (select id from saved where name = 'ab'), 9) from ids $$, 'mark_read by a non-member changes nothing (they have no marker there)');
select is((select private.can_listen('chat:' || (select id from saved where name = 'ab'))), false, 'a non-member cannot join the live channel');
select pg_temp.as_user(anna) from ids;
select is((select private.can_listen('chat:' || (select id from saved where name = 'ab'))), true, 'a member can join it');
select is((select private.can_listen('chat:not-a-uuid')), false, 'a malformed channel name is refused, not an error');
select is_empty($$ select 1 from public.list_messages((select id from public.communities where slug = 'test-other-chats'), (select id from saved where name = 'ab')) $$,
  'asked under another community, the chat is not there');

-- Applicants: only after the admin has written -------------------------------------------------
select pg_temp.as_user(carl) from ids;
insert into saved select 'cd', public.open_dm(biking, dina) from ids;
select pg_temp.as_user(dina) from ids;
select throws_ok($$ select public.open_dm(biking, carl) from ids $$, '42501', null, 'an applicant cannot open DMs');
select is((select public.admin_chat(biking) from ids), null, 'no "Chat with admin" before the admin writes');
select throws_ok($$ select public.send_message(biking, (select id from saved where name = 'cd'), 'Hello?') from ids $$, '42501', null, 'the applicant cannot write first');
select is_empty($$ select 1 from public.chat_list((select biking from ids)) $$, 'applicants have no chat list');
select pg_temp.as_user(carl) from ids;
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'cd'), 'Hi Dina, a question about your application') from ids $$, 'the admin writes');
select pg_temp.as_user(dina) from ids;
select is((select public.admin_chat(biking) from ids), (select id from saved where name = 'cd'), 'now "Chat with admin" opens that DM');
select lives_ok($$ select public.send_message(biking, (select id from saved where name = 'cd'), 'Hi, sure!') from ids $$, 'and the applicant can answer');

-- Losing access --------------------------------------------------------------------------------
reset role;
update public.members set state = 'removed' where user_id = (select bert from ids);
set local role authenticated;
select pg_temp.as_user(bert) from ids;
select is_empty($$ select 1 from public.list_messages((select biking from ids), (select id from saved where name = 'ab')) $$, 'a removed member reads nothing');
select is((select private.can_listen('chat:' || (select id from saved where name = 'ab'))), false, 'and can no longer join the live channel');

select * from finish();
rollback;
