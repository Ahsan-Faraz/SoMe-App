begin;
create extension if not exists pgtap with schema extensions;

select plan(46);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'a1300000-0000-4000-8000-00000000000a'::uuid as anna, -- owner
  'a1300000-0000-4000-8000-00000000000b'::uuid as bert, -- member who views
  'a1300000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  'a1300000-0000-4000-8000-00000000000d'::uuid as dora, -- blocked by Anna
  'a1300000-0000-4000-8000-00000000000e'::uuid as erik; -- applicant
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test a13 ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dora, 'dora'), (ids.erik, 'erik')) as u (id, name);
update public.members set state = 'approved' where user_id in (select unnest(array[anna, bert, carl, dora]) from ids);
update public.members set state = 'applied' where user_id = (select erik from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);
insert into public.blocks (community_id, blocker_id, blocked_id) select biking, anna, dora from ids;

-- Uploaded files in Anna's folder of the private bucket (photo n: …0f<n>.webp and _t.webp), one in Bert's.
create function pg_temp.file(p_user uuid, n integer, p_thumb boolean default false) returns text language sql stable as $$
  select (select biking from ids) || '/' || p_user || '/a1300000-0000-4000-8000-0000000000f' || n || case when p_thumb then '_t' else '' end || '.webp'
$$;
create function pg_temp.photo(p_user uuid, n integer) returns jsonb language sql stable as $$
  select jsonb_build_object('path', pg_temp.file(p_user, n), 'thumb_path', pg_temp.file(p_user, n, true), 'width', 1600, 'height', 1200, 'taken_in_app', n = 1)
$$;
insert into storage.objects (bucket_id, name)
select 'private', pg_temp.file(u, n, t) from ids, unnest(array[ids.anna, ids.bert]) as u, generate_series(1, 4) as n, unnest(array[false, true]) as t;

create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.album(p_name text) returns uuid language sql as $$ select id from saved where name = p_name $$;
create function pg_temp.view(p_name text) returns jsonb language sql as $$ select public.album_view((select biking from ids), pg_temp.album(p_name)) $$;
-- How many of these files the caller may read through Storage (the signed-link check).
create function pg_temp.readable(p_names text[]) returns integer language sql as $$
  select count(*)::integer from storage.objects where bucket_id = 'private' and name = any (p_names)
$$;
grant execute on function pg_temp.file(uuid, integer, boolean), pg_temp.photo(uuid, integer), pg_temp.as_user(uuid), pg_temp.album(text),
  pg_temp.view(text), pg_temp.readable(text[]) to anon, authenticated;

-- Schema ---------------------------------------------------------------------------------------
select has_table('public', 'albums', 'albums table exists');
select is((select bool_and(relrowsecurity) from pg_class where oid in ('public.albums'::regclass, 'public.album_photos'::regclass, 'public.album_grants'::regclass, 'public.album_attempts'::regclass)),
  true, 'every album table has RLS on');

set local role anon;
select throws_ok($$ select public.create_album(biking, 'Test x') from ids $$, '42501', null, 'anon cannot make albums');
reset role;

-- Anna makes albums ----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(erik) from ids;
select throws_ok($$ select public.create_album(biking, 'Test x') from ids $$, '42501', null, 'an applicant can''t make albums');

select pg_temp.as_user(anna) from ids;
insert into saved select 'rides', public.create_album(biking, '  Test Rides ') from ids;
insert into saved select 'secret', public.create_album(biking, 'Test Secret') from ids;
select isnt(pg_temp.album('rides'), null, 'Anna makes an album');
select throws_ok($$ select public.create_album(biking, '  ') from ids $$, '22023', null, 'an album needs a name');
select throws_ok($$ select public.create_album(biking, repeat('x', 81)) from ids $$, '22023', null, 'of at most 80 characters');

select lives_ok($$ select public.add_album_photo(biking, pg_temp.album('rides'), pg_temp.photo(anna, 1)) from ids $$, 'she adds a camera photo');
select lives_ok($$ select public.add_album_photo(biking, pg_temp.album('rides'), pg_temp.photo(anna, 3)) from ids $$, 'and an upload');
select lives_ok($$ select public.add_album_photo(biking, pg_temp.album('secret'), pg_temp.photo(anna, 2)) from ids $$, 'and one to the other album');
select is((pg_temp.view('rides') -> 'photos' -> 0 ->> 'taken_in_app')::boolean, true, 'a camera photo is Taken in app');
select is((select array_agg(p ->> 'path' order by n) from jsonb_array_elements(pg_temp.view('rides') -> 'photos') with ordinality as x (p, n)),
  (select array[pg_temp.file(anna, 1), pg_temp.file(anna, 3)] from ids), 'photos keep the order they were added in');
select throws_ok($$ select public.add_album_photo(biking, pg_temp.album('rides'), pg_temp.photo(bert, 1)) from ids $$, '22023', null, 'only files from your own folder');
select throws_ok($$ select public.add_album_photo(biking, pg_temp.album('rides'), pg_temp.photo(anna, 9)) from ids $$, '22023', null, 'and only uploaded ones');

select throws_ok($$ select public.set_album_password(biking, pg_temp.album('secret'), 'abc') from ids $$, '22023', null, 'a password has at least 4 characters');
select lives_ok($$ select public.set_album_password(biking, pg_temp.album('secret'), 'gravel42') from ids $$, 'Anna locks an album');
select throws_ok($$ select password_hash from public.albums $$, '42501', null, 'the password hash can''t be read, not even by the owner');
select is(pg_temp.view('secret')::text like '%$2_$%', false, 'no read returns the hash (album_view, the owner''s own)');

-- Bert looks -------------------------------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
select throws_ok($$ select public.add_album_photo(biking, pg_temp.album('rides'), pg_temp.photo(bert, 1)) from ids $$, '42501', null, 'nobody adds to someone else''s album');
select results_eq(
  $$ select name, locked, photos, cover from public.album_list((select biking from ids), (select anna from ids)) order by name $$,
  $$ select 'Test Rides'::text, false, 2, pg_temp.file(anna, 1, true) from ids union all select 'Test Secret', true, 1, null::text $$,
  'the list: an open album has a cover; a locked one never shows a photo'
);
select is(jsonb_array_length(pg_temp.view('rides') -> 'photos'), 2, 'an open album shows its photos');
select is(pg_temp.view('secret') ->> 'access', 'locked', 'a locked album is locked');
select is(pg_temp.view('secret') -> 'photos', '[]'::jsonb, 'and has no photos');
select is((select pg_temp.readable(array[pg_temp.file(anna, 1), pg_temp.file(anna, 1, true)]) from ids), 0,
  'Storage never lets another member read album files (the server signs them after album_view)');

select is((select public.open_album(biking, pg_temp.album('secret'), 'Gravel42') from ids), 'wrong', 'a wrong password');
select is(pg_temp.view('secret') -> 'photos', '[]'::jsonb, 'returns no photos');
select is((select public.open_album(biking, pg_temp.album('secret'), 'gravel42') from ids), 'open', 'the right one opens it');
select is(jsonb_array_length(pg_temp.view('secret') -> 'photos'), 1, 'its photos show');
select is((pg_temp.view('secret') ->> 'access'), 'open', 'open for him (for the hour)');

-- Anna changes the password: it is locked for Bert again.
select pg_temp.as_user(anna) from ids;
select is((select pg_temp.readable(array[pg_temp.file(anna, 2), pg_temp.file(anna, 2, true)]) from ids), 2, 'the owner reads her own files');
select is((select cover from public.album_list((select biking from ids), (select anna from ids)) where name = 'Test Secret'), null, 'the owner''s list shows no photo on a locked album either');
select public.set_album_password(biking, pg_temp.album('secret'), 'newpass1') from ids;
select pg_temp.as_user(bert) from ids;
select is(pg_temp.view('secret') ->> 'access', 'locked', 'a new password locks it again for everyone');

-- Guessing: 5 wrong in 15 minutes, then wait (even with the right one).
select public.open_album(biking, pg_temp.album('secret'), 'guess' || n) from ids, generate_series(1, 5) as n;
select is((select public.open_album(biking, pg_temp.album('secret'), 'newpass1') from ids), 'wait', 'after 5 wrong tries, wait');
reset role;
update public.album_attempts set since = now() - interval '16 minutes';
set local role authenticated;
select pg_temp.as_user(bert) from ids;
select is((select public.open_album(biking, pg_temp.album('secret'), 'newpass1') from ids), 'open', '15 minutes later the right one works');

-- Blocks, admins ---------------------------------------------------------------------------------
select pg_temp.as_user(dora) from ids;
select is_empty($$ select 1 from public.album_list((select biking from ids), (select anna from ids)) $$, 'someone Anna blocked sees none of her albums');
select throws_ok($$ select public.open_album(biking, pg_temp.album('secret'), 'newpass1') from ids $$, '42501', null, 'and can''t open one');
select pg_temp.as_user(carl) from ids;
select is(pg_temp.view('secret') ->> 'access', 'locked', 'the community admin needs the password too');

-- "From profile/album" ---------------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select is((select count(*)::int from public.my_album_photos((select biking from ids))), 3, 'Anna''s own album photos, to copy into a chat or ad');
select pg_temp.as_user(bert) from ids;
select is((select count(*)::int from public.my_album_photos((select biking from ids))), 0, 'never someone else''s');

-- Deleting ---------------------------------------------------------------------------------------
select throws_ok($$ select public.remove_album_photo(biking, (select (pg_temp.view('rides') -> 'photos' -> 0 ->> 'id')::uuid)) from ids $$,
  '42501', null, 'nobody deletes someone else''s photo');
select pg_temp.as_user(anna) from ids;
select is(
  (select public.remove_album_photo(biking, (pg_temp.view('rides') -> 'photos' -> 0 ->> 'id')::uuid) -> 'files' from ids),
  (select jsonb_build_array(pg_temp.file(anna, 1), pg_temp.file(anna, 1, true)) from ids),
  'deleting a photo returns both its files, for the server to remove'
);
select is((select photos from public.album_list((select biking from ids), (select anna from ids)) where name = 'Test Rides'), 1, 'the album has one photo left');
select is(jsonb_array_length((select public.delete_album(biking, pg_temp.album('secret')) -> 'files' from ids)), 2, 'deleting an album returns its files');
select is((select count(*)::int from public.album_list((select biking from ids), (select anna from ids))), 1, 'and it is gone');

-- Limits -----------------------------------------------------------------------------------------
reset role;
insert into public.albums (community_id, owner_id, name) select biking, anna, 'Test filler ' || n from ids, generate_series(1, 49) as n;
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select public.create_album(biking, 'Test 51st') from ids $$, '22023', 'at most 50 albums', 'at most 50 albums each');
reset role;
insert into public.photos (community_id, owner_id, bucket, path, thumb_path, purpose)
select biking, anna, 'private', biking || '/' || anna || '/fill-' || n || '.webp', biking || '/' || anna || '/fill-' || n || '_t.webp', 'album' from ids, generate_series(1, 199) as n;
insert into public.album_photos (album_id, photo_id, community_id, position)
select (select id from saved where name = 'rides'), p.id, p.community_id, 1000 + row_number() over () from public.photos p where p.path like '%/fill-%';
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select public.add_album_photo(biking, pg_temp.album('rides'), pg_temp.photo(anna, 4)) from ids $$, '22023', 'at most 200 photos an album', 'at most 200 photos an album');

select * from finish();
rollback;
