begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'a1500000-0000-4000-8000-00000000000a'::uuid as anna, -- deletes her account
  'a1500000-0000-4000-8000-00000000000b'::uuid as bert, -- DMs and comments with Anna
  'a1500000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  'a1500000-0000-4000-8000-00000000000d'::uuid as dora, -- platform admin, deletes her account
  'a1500000-0000-4000-8000-00000000000e'::uuid as erik, -- applicant, deletes his account
  'a1500000-0000-4000-8000-0000000000c1'::uuid as dm,
  'a1500000-0000-4000-8000-0000000000c2'::uuid as grp;
grant select on ids to anon, authenticated, service_role;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test a15 ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dora, 'dora'), (ids.erik, 'erik')) as u (id, name);
update public.members set state = 'approved' where user_id in (select unnest(array[anna, bert, carl, dora]) from ids);
update public.members set state = 'applied' where user_id = (select erik from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);
insert into public.platform_admins (user_id) select dora from ids;

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
-- A file in a member's folder: {community}/{user}/a15…f<n>.webp (or _t).
create function pg_temp.file(p_user uuid, n integer, p_thumb boolean default false) returns text language sql stable as $$
  select (select biking from ids) || '/' || p_user || '/a1500000-0000-4000-8000-0000000000f' || n || case when p_thumb then '_t' else '' end || '.webp'
$$;
-- A photo row (n) for files in the owner's folder of a bucket, both files uploaded.
create function pg_temp.photo(p_user uuid, n integer, p_bucket text, p_purpose text) returns uuid language sql as $$
  insert into storage.objects (bucket_id, name) values (p_bucket, pg_temp.file(p_user, n)), (p_bucket, pg_temp.file(p_user, n, true));
  insert into public.photos (community_id, owner_id, bucket, path, thumb_path, purpose)
  values ((select biking from ids), p_user, p_bucket, pg_temp.file(p_user, n), pg_temp.file(p_user, n, true), p_purpose)
  returning id;
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.file(uuid, integer, boolean) to anon, authenticated, service_role;

-- Anna's things: a profile image, an album photo, an ad with an image, a file that never got a row.
update public.members m set photo_id = pg_temp.photo(ids.anna, 1, 'profile', 'profile') from ids where m.user_id = ids.anna;
insert into public.albums (id, community_id, owner_id, name) select 'a1500000-0000-4000-8000-0000000000a1', biking, anna, 'Test album' from ids;
insert into public.album_photos (album_id, photo_id, community_id, position)
select 'a1500000-0000-4000-8000-0000000000a1', pg_temp.photo(anna, 2, 'private', 'album'), biking, 1 from ids;
insert into public.ads (community_id, user_id, looking_for, headline, photo_id)
select biking, anna, array[(select id from public.community_options where community_id = biking and list = 'status' limit 1)], 'Test a15 ad', pg_temp.photo(anna, 3, 'private', 'ad') from ids;
insert into storage.objects (bucket_id, name) select 'private', pg_temp.file(anna, 4) from ids;

-- A DM between Anna and Bert (Bert sent a photo), and a group where Bert comments on Anna's post
-- with a photo and also posts a photo of his own.
insert into public.chats (id, community_id, kind, dm_user_a, dm_user_b, created_by)
select dm, biking, 'dm', least(anna, bert), greatest(anna, bert), anna from ids;
insert into public.chats (id, community_id, kind, name, created_by) select grp, biking, 'group', 'Test a15 group', carl from ids;
insert into public.chat_members (chat_id, community_id, user_id)
select dm, biking, u from ids, unnest(array[anna, bert]) as u union all select grp, biking, u from ids, unnest(array[anna, bert, carl]) as u;
insert into public.messages (chat_id, seq, community_id, author_id, body, photo_id)
select dm, 1, biking, anna, 'Test hi', null from ids
union all select dm, 2, biking, bert, null, pg_temp.photo(bert, 5, 'private', 'chat') from ids;
insert into public.messages (chat_id, seq, community_id, author_id, body, photo_id, reply_to_seq)
select grp, 1, biking, anna, 'Test ride?', null, null from ids
union all select grp, 2, biking, bert, null, pg_temp.photo(bert, 6, 'private', 'chat'), 1 from ids
union all select grp, 3, biking, bert, 'Test mine', pg_temp.photo(bert, 7, 'private', 'chat'), null from ids;
update public.chats set last_seq = 3 where id = (select grp from ids);
update public.chats set last_seq = 2 where id = (select dm from ids);
insert into public.notes (community_id, author_id, subject_id, body, stars) select biking, bert, anna, 'Test note', 4 from ids;
insert into public.blocks (community_id, blocker_id, blocked_id) select biking, anna, carl from ids;

create temp table result (who text primary key, data jsonb);
grant all on result to authenticated;

-- Rate limits ----------------------------------------------------------------------------------
select has_table('public', 'rate_limits', 'rate_limits table exists');
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select public.rate_limit_take('password', array['ip:test'], array[5], 900) $$, '42501', null, 'members can''t call the rate limit');
select throws_ok($$ select * from public.rate_limits $$, '42501', null, 'nor read its table');
reset role;
set local role anon;
select throws_ok($$ select public.rate_limit_take('password', array['ip:test'], array[5], 900) $$, '42501', null, 'nor can anon');
reset role;

set local role service_role;
select is((select array_agg(public.rate_limit_take('password', array['ip:a15', 'login:a15'], array[20, 3], 900)) from generate_series(1, 3)),
  array[0, 0, 0], 'the server: three tries pass');
select ok(public.rate_limit_take('password', array['ip:a15', 'login:a15'], array[20, 3], 900) > 850, 'the fourth on that login waits about 15 minutes');
select is(public.rate_limit_take('password', array['ip:a15', 'login:other-a15'], array[20, 3], 900), 0, 'another login from the same IP still may');
select public.rate_limit_refund('password', array['login:a15']);
select is(public.rate_limit_take('password', array['ip:a15', 'login:a15'], array[20, 3], 900), 0, 'a refund (a success) gives the slot back');
select is(public.rate_limit_take('code', array['login:a15'], array[3], 900), 0, 'buckets are separate');
select throws_ok($$ select public.rate_limit_take('password', array['a', 'b', 'c', 'd', 'e'], array[1, 1, 1, 1, 1], 60) $$, '22023', null, 'at most 4 keys');
select throws_ok($$ select public.rate_limit_take('password', array['a'], array[1, 2], 60) $$, '22023', null, 'a limit for each key');
select throws_ok($$ select public.rate_limit_take('nope', array['a'], array[1], 60) $$, '23514', null, 'known buckets only');
reset role;
select is((select bool_and(octet_length(key_hash) = 32) from public.rate_limits), true, 'keys are stored as SHA-256 hashes');
select is((select count(*)::int from public.rate_limits where encode(key_hash, 'escape') like '%a15%'), 0, 'never as the IP or login itself');
update public.rate_limits set since = now() - interval '16 minutes';
set local role service_role;
select is(public.rate_limit_take('password', array['ip:a15', 'login:a15'], array[20, 3], 900), 0, '15 minutes later the login may try again');
reset role;

-- Delete my account ----------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.delete_my_account(biking) from ids $$, '42501', null, 'anon can''t delete an account');
reset role;

-- The last community admin can't (the other admins step down inside this test only).
update public.members set role = 'member' where community_id = (select biking from ids) and role = 'admin' and user_id <> (select carl from ids);
set local role authenticated;
select pg_temp.as_user(carl) from ids;
select throws_ok($$ select public.delete_my_account(biking) from ids $$, '55000', null, 'the community''s last admin can''t delete their account');

select pg_temp.as_user(anna) from ids;
insert into result select 'anna', public.delete_my_account(biking) from ids;
reset role;
select is((select count(*)::int from public.members where user_id = (select anna from ids)), 0, 'Anna''s account is gone');
select is((select data -> 'login_deleted' from result where who = 'anna'), 'true'::jsonb, 'it was her only one: the login is deleted too');
select is((select count(*)::int from auth.users where id = (select anna from ids)), 0, 'her email and password are gone');
select is((select count(*)::int from public.photos where owner_id = (select anna from ids)), 0, 'her photo rows are gone');
select is((select count(*)::int from public.ads where user_id = (select anna from ids)) + (select count(*)::int from public.albums where owner_id = (select anna from ids)), 0,
  'her ads and albums are gone');
select is((select count(*)::int from public.chats where id = (select dm from ids)), 0, 'her DM is gone, for both');
select is((select count(*)::int from public.messages where chat_id = (select grp from ids)), 1, 'her post and the comment on it are gone; Bert''s own post stays');
select is((select count(*)::int from public.notes where subject_id = (select anna from ids)), 0, 'notes about her are gone');
select is((select count(*)::int from public.photos where owner_id = (select bert from ids)), 1, 'Bert''s photos in the DM and the comment are gone, his own post''s stays');
select is((select array(select jsonb_array_elements_text(data -> 'private') order by 1) from result where who = 'anna'),
  (select array(select x from unnest(array[pg_temp.file(anna, 2), pg_temp.file(anna, 2, true), pg_temp.file(anna, 3), pg_temp.file(anna, 3, true), pg_temp.file(anna, 4),
    pg_temp.file(bert, 5), pg_temp.file(bert, 5, true), pg_temp.file(bert, 6), pg_temp.file(bert, 6, true)]) as x order by 1) from ids),
  'the private files to remove: her album, ad and stray upload, and Bert''s photos that lost their post');
select is((select array(select jsonb_array_elements_text(data -> 'profile') order by 1) from result where who = 'anna'),
  (select array(select x from unnest(array[pg_temp.file(anna, 1), pg_temp.file(anna, 1, true)]) as x order by 1) from ids), 'the profile files to remove: her profile image');

set local role authenticated;
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select public.delete_my_account(biking) from ids $$, '42501', null, 'once deleted, there is nothing left to delete');
select pg_temp.as_user(dora) from ids;
insert into result select 'dora', public.delete_my_account(biking) from ids;
select pg_temp.as_user(erik) from ids;
insert into result select 'erik', public.delete_my_account(biking) from ids;
reset role;
select is((select data -> 'login_deleted' from result where who = 'dora'), 'false'::jsonb, 'a platform admin keeps the login');
select is((select count(*)::int from auth.users where id = (select dora from ids)), 1, 'so her login stays');
select is((select count(*)::int from public.members where user_id = (select dora from ids)), 0, 'while her account here is gone');
select is((select data -> 'login_deleted' from result where who = 'erik'), 'true'::jsonb, 'an applicant can delete their account too');
select is((select count(*)::int from public.members where user_id = (select bert from ids)), 1, 'Bert''s account is untouched');

select * from finish();
rollback;
