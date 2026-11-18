begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'a2400000-0000-4000-8000-00000000000a'::uuid as anna, -- applicant: approved (images kept), then removed
  'a2400000-0000-4000-8000-00000000000b'::uuid as bert, -- applicant: rejected (images always deleted)
  'a2400000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  'a2400000-0000-4000-8000-00000000000d'::uuid as dina, -- member: group application approved, then leaves
  'a2400000-0000-4000-8000-00000000000e'::uuid as erik, -- member: added with "+", then taken out
  'a2400000-0000-4000-8000-00000000000f'::uuid as fred, -- member: group that deletes images
  'a2400000-0000-4000-8000-000000000010'::uuid as gina; -- member hidden from search, with an ad
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
update public.communities set require_identity = true, require_app_image = true, require_app_text = false,
  require_app_names = false, direct_join = false, keep_application_images = false
where slug = 'biking-stockholm';

-- Only the seeded fields count as required here (an admin may have added more on the dev project).
update public.profile_fields f set active = false
from ids
where f.community_id = ids.biking and f.key not in (
  'headline', 'about', 'about_us', 'bike_type', 'ride_days', 'ride_style', 'rides_per_month', 'riding_since', 'own_bike', 'ride_together', 'area', 'bike_photo'
);

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '24@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dina, 'dina'),
  (ids.erik, 'erik'), (ids.fred, 'fred'), (ids.gina, 'gina')) as u (id, name);
update public.members set state = 'approved', visible_in_search = true
where user_id in (select unnest(array[carl, dina, erik, fred, gina]) from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
-- An image's files in the private bucket: {community}/{owner}/{file}.webp and _t.webp.
create function pg_temp.photo(p_owner uuid, p_file text) returns jsonb language sql stable as $$
  select jsonb_build_object('path', ids.biking || '/' || p_owner || '/' || p_file || '.webp',
    'thumb_path', ids.biking || '/' || p_owner || '/' || p_file || '_t.webp', 'width', 1600, 'height', 1200, 'taken_in_app', true)
  from ids
$$;
create function pg_temp.complete_profile() returns void language sql as $$
  select public.save_profile((select biking from ids),
    jsonb_build_object('status_id', (select o.id from public.community_options o, ids where o.community_id = ids.biking and o.list = 'status' and o.label ->> 'en' = 'Man')),
    jsonb_build_array(jsonb_build_object('field_id', (select f.id from public.profile_fields f, ids where f.community_id = ids.biking and f.key = 'about'), 'value', 'Road and gravel.')))
$$;
-- The community application: an image and an ID photo.
create function pg_temp.apply(p_owner uuid) returns uuid language sql as $$
  select public.submit_application((select biking from ids), jsonb_build_object(
    'photo', pg_temp.photo(p_owner, 'a2400000-0000-4000-8000-' || right(p_owner::text, 6) || '000001'),
    'id_photo', pg_temp.photo(p_owner, 'a2400000-0000-4000-8000-' || right(p_owner::text, 6) || '000002')))
$$;
-- A group application: an image.
create function pg_temp.apply_group(p_owner uuid, p_chat uuid) returns void language sql as $$
  select public.apply_to_group((select biking from ids), p_chat, jsonb_build_object(
    'photo', pg_temp.photo(p_owner, 'a2400000-0000-4000-8000-' || right(p_owner::text, 6) || '000003')))
$$;
create function pg_temp.app_of(p_user uuid, p_chat uuid) returns uuid language sql stable as $$
  select a.id from public.applications a, ids
  where a.community_id = ids.biking and a.user_id = p_user and a.chat_id is not distinct from p_chat
  order by a.created_at desc limit 1
$$;
create function pg_temp.files(p_result jsonb) returns integer language sql immutable as $$
  select jsonb_array_length(coalesce(p_result -> 'files', '[]'))
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.photo(uuid, text), pg_temp.complete_profile(), pg_temp.apply(uuid),
  pg_temp.apply_group(uuid, uuid), pg_temp.app_of(uuid, uuid), pg_temp.files(jsonb) to authenticated;

create temp table saved (name text primary key, id uuid, value jsonb);
grant all on saved to authenticated;

-- The uploaded files (Storage rows), as the upload API makes them.
insert into storage.objects (bucket_id, name)
select 'private', ids.biking || '/' || u.id || '/a2400000-0000-4000-8000-' || right(u.id::text, 6) || k.n || s.suffix
from ids
cross join lateral (values (ids.anna), (ids.bert), (ids.dina), (ids.erik), (ids.fred)) as u (id)
cross join (values ('000001'), ('000002'), ('000003')) as k (n)
cross join (values ('.webp'), ('_t.webp')) as s (suffix);

-- Schema ---------------------------------------------------------------------------------------
select has_column('public', 'communities', 'keep_application_images', 'a community can keep application images');
select has_column('public', 'chats', 'keep_application_images', 'so can a group');

-- Community settings: 18+ and keep images -----------------------------------------------------
set local role authenticated;
select pg_temp.as_user(carl) from ids;
select lives_ok($$
  select public.save_community_settings(biking, '{"application_text": "", "require_app_image": true, "require_app_text": false,
    "require_app_names": false, "direct_join": false, "require_age_18": false, "keep_application_images": true}') from ids
$$, 'the community admin turns 18+ off and keeping images on');
select results_eq(
  $$ select require_age_18, keep_application_images from public.communities where id = (select biking from ids) $$,
  $$ values (false, true) $$, 'both are saved'
);
select lives_ok($$
  select public.save_community_settings(biking, '{"application_text": "", "require_app_image": true, "require_app_text": false,
    "require_app_names": false, "direct_join": false}') from ids
$$, 'the older build''s call (without the new keys) still works');
select results_eq(
  $$ select require_age_18, keep_application_images from public.communities where id = (select biking from ids) $$,
  $$ values (false, true) $$, 'and keeps both values'
);
select throws_ok($$
  select public.save_community_settings(biking, '{"application_text": "", "require_app_image": true, "require_app_text": false,
    "require_app_names": false, "direct_join": false, "keep_application_images": "yes"}') from ids
$$, '22023', null, 'a setting that is not true/false is refused');
select pg_temp.as_user(dina) from ids;
select throws_ok($$
  select public.save_community_settings(biking, '{"application_text": "", "require_app_image": true, "require_app_text": false,
    "require_app_names": false, "direct_join": false, "require_age_18": true}') from ids
$$, '42501', null, 'a member can''t change them');

-- Community: approved keeps, rejected deletes, removal deletes ---------------------------------
select pg_temp.as_user(anna) from ids;
select pg_temp.complete_profile();
insert into saved (name, id) select 'anna', pg_temp.apply(anna) from ids;
select pg_temp.as_user(bert) from ids;
select pg_temp.complete_profile();
insert into saved (name, id) select 'bert', pg_temp.apply(bert) from ids;
select pg_temp.as_user(carl) from ids;
select is(pg_temp.files(public.decide_application((select id from saved where name = 'anna'), 'approved')), 0,
  'approving keeps the images when the community keeps them: no files to delete');
select results_eq(
  $$ select a -> 'photo' ->> 'path' is not null, a -> 'id_photo' ->> 'path' is not null, a ->> 'media_deleted_at' is null
     from (select public.admin_member(biking, anna) -> 'application' as a from ids) as x $$,
  $$ values (true, true, true) $$, 'the admin still sees the application image and the ID photo'
);
select is(pg_temp.files(public.decide_application((select id from saved where name = 'bert'), 'rejected')), 4,
  'a rejected application''s images are always deleted (image and ID photo, with thumbnails)');
select is((select pg_temp.files(public.remove_member(biking, anna)) from ids), 4, 'removing the member deletes the images that were kept');
reset role; -- clients have no grant on photos
select is(
  (select count(*)::int from public.photos where owner_id = (select anna from ids) and purpose in ('application', 'identity')), 0,
  'and their rows'
);
select isnt((select media_deleted_at from public.applications where id = (select id from saved where name = 'anna')), null,
  'the application then says when they were deleted');
set local role authenticated;
select pg_temp.as_user(carl) from ids;

-- Groups -------------------------------------------------------------------------------------------
insert into saved (name, id) select 'keep', public.save_group(biking, null,
  '{"name": "Test keep 261115", "require_app_image": true, "require_app_text": false, "keep_application_images": true}') from ids;
select is((select public.group_settings(biking, (select id from saved where name = 'keep')) ->> 'keep_application_images' from ids), 'true',
  'a group keeps application images when its admin says so');
select public.save_group(biking, (select id from saved where name = 'keep'), '{"name": "Test keep 261115"}') from ids;
select is((select public.group_settings(biking, (select id from saved where name = 'keep')) ->> 'keep_application_images' from ids), 'true',
  'a save without the setting (the older build) keeps it');

select pg_temp.as_user(dina) from ids;
select pg_temp.apply_group(dina, (select id from saved where name = 'keep')) from ids;
select pg_temp.as_user(erik) from ids;
select pg_temp.apply_group(erik, (select id from saved where name = 'keep')) from ids;
select pg_temp.as_user(carl) from ids;
select is((select pg_temp.files(public.decide_application(pg_temp.app_of(dina, (select id from saved where name = 'keep')), 'approved')) from ids), 0,
  'approving a group application keeps its image');
select is((select pg_temp.files(public.set_group_member(biking, (select id from saved where name = 'keep'), erik, true)) from ids), 0,
  'so does adding the applicant with "+"');
select pg_temp.as_user(dina) from ids;
select is((select pg_temp.files(public.leave_chat(biking, (select id from saved where name = 'keep'), 'leave')) from ids), 2,
  'leaving the group deletes the image it kept (image and thumbnail)');
select pg_temp.as_user(carl) from ids;
select is((select pg_temp.files(public.set_group_member(biking, (select id from saved where name = 'keep'), erik, false)) from ids), 2,
  'taking a member out deletes the image the group kept');

insert into saved (name, id) select 'plain', public.save_group(biking, null,
  '{"name": "Test plain 261115", "require_app_image": true, "require_app_text": false}') from ids;
select pg_temp.as_user(fred) from ids;
select pg_temp.apply_group(fred, (select id from saved where name = 'plain')) from ids;
select pg_temp.as_user(carl) from ids;
select is((select pg_temp.files(public.decide_application(pg_temp.app_of(fred, (select id from saved where name = 'plain')), 'approved')) from ids), 2,
  'a group that doesn''t keep them deletes the image on approval, as before');

-- Ads: a member hidden from search keeps their ads in the Ads tab --------------------------------
reset role;
update public.members set visible_in_search = false where user_id = (select gina from ids);
insert into public.ads (community_id, user_id, looking_for, headline)
select biking, gina, array[(select o.id from public.community_options o where o.community_id = ids.biking and o.list = 'status' limit 1)], 'Test 261115 ad'
from ids;
set local role authenticated;
select pg_temp.as_user(erik) from ids;
select ok(exists (select 1 from public.search_ads((select biking from ids), 100) where user_id = (select gina from ids)),
  'an ad shows in the Ads tab although its author is hidden from search');
reset role;
insert into public.blocks (community_id, blocker_id, blocked_id) select biking, gina, erik from ids;
set local role authenticated;
select ok(not exists (select 1 from public.search_ads((select biking from ids), 100) where user_id = (select gina from ids)),
  'a block still hides it');

-- Internal ---------------------------------------------------------------------------------------
select throws_ok($$ select private.decision_media(gen_random_uuid(), 'approved') $$, '42501', null, 'the keep check is internal');
reset role;

select * from finish();
rollback;
