begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'a2300000-0000-4000-8000-00000000000a'::uuid as anna, -- has a profile image; posts a photo and an ad
  'a2300000-0000-4000-8000-00000000000b'::uuid as bert, -- comments on Anna's photo
  'a2300000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  'a2300000-0000-4000-8000-0000000000f0'::uuid as icon; -- Anna's profile image
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '23@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl')) as u (id, name);
update public.members set state = 'approved', visible_in_search = true where user_id in (select unnest(array[anna, bert, carl]) from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);

-- Anna's profile image, and the files of her chat photo and her ad photo in the private bucket.
insert into public.photos (id, community_id, owner_id, bucket, path, thumb_path, purpose)
select icon, biking, anna, 'profile', biking || '/' || anna || '/icon.webp', biking || '/' || anna || '/icon_t.webp', 'profile' from ids;
update public.members set photo_id = (select icon from ids) where user_id = (select anna from ids);
insert into storage.objects (bucket_id, name)
select 'private', ids.biking || '/' || ids.anna || '/' || f.name || s.suffix
from ids cross join (values ('a2300000-0000-4000-8000-0000000000f1'), ('a2300000-0000-4000-8000-0000000000f2')) as f (name) cross join (values ('.webp'), ('_t.webp')) as s (suffix);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.photo(p_name text) returns jsonb language sql as $$
  select jsonb_build_object('path', biking || '/' || anna || '/' || p_name || '.webp', 'thumb_path', biking || '/' || anna || '/' || p_name || '_t.webp',
    'width', 1600, 'height', 900, 'taken_in_app', false) from ids
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.photo(text) to anon, authenticated;
create temp table saved (name text primary key, id uuid, n bigint);
grant all on saved to authenticated;

-- Not for everyone -------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select 1 from public.list_messages((select biking from ids), gen_random_uuid()) $$, '42501', null, 'a visitor can''t read posts');
select throws_ok($$ select 1 from public.search_ads((select biking from ids)) $$, '42501', null, 'nor ads');
select throws_ok($$ select 1 from public.member_ads((select biking from ids), (select anna from ids)) $$, '42501', null, 'nor a member''s ads');
reset role;

-- Chats: the author's profile image, the commented photo, the upload time ---------------------------
set local role authenticated;
select pg_temp.as_user(carl) from ids;
insert into saved (name, id) select 'g', public.save_group(biking, null, '{"name": "Test 261111", "allow_commenting": true}') from ids;
select public.set_group_member(biking, (select id from saved where name = 'g'), u, true) from ids, unnest(array[anna, bert]) as u;
select pg_temp.as_user(anna) from ids;
insert into saved (name, n) select 'photo', (public.send_message(biking, (select id from saved where name = 'g'), null, null, null, pg_temp.photo('a2300000-0000-4000-8000-0000000000f1')) ->> 'seq')::bigint from ids;
select pg_temp.as_user(bert) from ids;
insert into saved (name, n) select 'comment', (public.send_message(biking, (select id from saved where name = 'g'), 'Test nice one', null, (select n from saved where name = 'photo')) ->> 'seq')::bigint from ids;

select is(
  (select author_icon from public.list_messages((select biking from ids), (select id from saved where name = 'g')) where seq = (select n from saved where name = 'photo')),
  (select biking || '/' || anna || '/icon_t.webp' from ids), 'a post carries its author''s profile image'
);
select is(
  (select author_icon from public.list_messages((select biking from ids), (select id from saved where name = 'g')) where seq = (select n from saved where name = 'comment')),
  null, 'an author without a profile image has none'
);
select is(
  (select reply_photo from public.list_messages((select biking from ids), (select id from saved where name = 'g')) where seq = (select n from saved where name = 'comment')),
  (select biking || '/' || anna || '/a2300000-0000-4000-8000-0000000000f1_t.webp' from ids), 'a comment on a photo carries that photo''s thumbnail'
);
select is(
  (select reply_photo from public.list_messages((select biking from ids), (select id from saved where name = 'g')) where seq = (select n from saved where name = 'photo')),
  null, 'a post that comments on nothing has none'
);
select ok(
  (select (photo ->> 'created_at') is not null and (photo ->> 'taken_at') is null from public.list_messages((select biking from ids), (select id from saved where name = 'g')) where seq = (select n from saved where name = 'photo')),
  'an uploaded photo says when it was uploaded'
);
select ok(private.can_read_chat_photo((select biking || '/' || anna || '/a2300000-0000-4000-8000-0000000000f1_t.webp' from ids)), 'the commenter can read the commented photo (to sign its link)');
reset role;
select is(
  (select private.message_json((select id from saved where name = 'g'), (select n from saved where name = 'comment')) ->> 'reply_photo'),
  (select biking || '/' || anna || '/a2300000-0000-4000-8000-0000000000f1_t.webp' from ids), 'the live message carries the commented photo too'
);
select is(
  (select private.message_json((select id from saved where name = 'g'), (select n from saved where name = 'photo')) ->> 'author_icon'),
  (select biking || '/' || anna || '/icon_t.webp' from ids), 'and the author''s profile image'
);

-- Ads: the author's profile image and the picture's time -------------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;
insert into saved (name, id) select 'ad', (public.save_ad(biking, null,
  array(select id from public.community_options where community_id = biking and list = 'status' and active order by position limit 1),
  'Test 261111 ad', '', null, '', pg_temp.photo('a2300000-0000-4000-8000-0000000000f2')) ->> 'id')::uuid from ids;
select pg_temp.as_user(bert) from ids;
select results_eq(
  $$ select author_icon, photo_at is not null, cardinality(looking_for) from public.search_ads((select biking from ids)) where id = (select id from saved where name = 'ad') $$,
  $$ select biking || '/' || anna || '/icon_t.webp', true, 1 from ids $$,
  'an ad card carries the author''s profile image, the picture''s time and Looking for'
);
select results_eq(
  $$ select author_icon, photo_at is not null from public.member_ads((select biking from ids), (select anna from ids)) where id = (select id from saved where name = 'ad') $$,
  $$ select biking || '/' || anna || '/icon_t.webp', true from ids $$,
  'so does a card on the member''s Ads'
);
select ok(
  (select (public.ad_view(biking, (select id from saved where name = 'ad')) -> 'photo' ->> 'created_at') is not null from ids),
  'an open ad says when its picture was uploaded'
);

-- The caller's own account, with their profile image (one query for every member screen) ------------
select pg_temp.as_user(anna) from ids;
select results_eq(
  $$ select username, role, state, icon from public.my_account((select biking from ids)) $$,
  $$ select 'Test anna'::text, 'member'::text, 'approved'::text, biking || '/' || anna || '/icon_t.webp' from ids $$,
  'my_account gives the caller''s account and profile image'
);
select is_empty($$ select 1 from public.my_account(gen_random_uuid()) $$, 'and nothing for a community they are not in');
reset role;
set local role anon;
select throws_ok($$ select 1 from public.my_account((select biking from ids)) $$, '42501', null, 'a visitor can''t call it');
reset role;
set local role authenticated;
select pg_temp.as_user(bert) from ids;

-- Community settings: the member list's column names ------------------------------------------------
select throws_ok(
  $$ select public.save_community_settings(biking, '{"application_text": "x", "require_app_image": true, "require_app_text": true, "require_app_names": true, "direct_join": false, "state_labels": ["A", "B", "C"]}') from ids $$,
  '42501', null, 'a member can''t save the settings'
);
select pg_temp.as_user(carl) from ids;
select lives_ok(
  $$ select public.save_community_settings(biking, '{"application_text": "x", "require_app_image": true, "require_app_text": true, "require_app_names": true, "direct_join": false, "state_labels": [" Test fee ", "", "Test key"]}') from ids $$,
  'the admin names the member list''s columns'
);
select results_eq(
  $$ select state_label_1, state_label_2, state_label_3 from public.communities where id = (select biking from ids) $$,
  $$ values ('Test fee'::text, null::text, 'Test key'::text) $$,
  'trimmed; an empty name clears the column'
);
select lives_ok(
  $$ select public.save_community_settings(biking, '{"application_text": "x", "require_app_image": true, "require_app_text": true, "require_app_names": true, "direct_join": false}') from ids $$,
  'settings without the names still save (an older build)'
);
select is((select state_label_1 from public.communities where id = (select biking from ids)), 'Test fee', 'and keep the names as they were');
select throws_ok(
  $$ select public.save_community_settings(biking, '{"application_text": "x", "require_app_image": true, "require_app_text": true, "require_app_names": true, "direct_join": false, "state_labels": ["A", "B"]}') from ids $$,
  '22023', null, 'two names are refused'
);
select throws_ok(
  $$ select public.save_community_settings(biking, jsonb_build_object('application_text', 'x', 'require_app_image', true, 'require_app_text', true, 'require_app_names', true, 'direct_join', false, 'state_labels', jsonb_build_array(repeat('x', 41), '', ''))) from ids $$,
  '22023', null, 'a name over 40 characters is refused'
);
reset role;

select * from finish();
rollback;
