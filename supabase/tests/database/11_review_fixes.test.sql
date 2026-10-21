begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'b0000000-0000-4000-8000-00000000000a'::uuid as anna, -- applies to groups with a photo
  'b0000000-0000-4000-8000-00000000000c'::uuid as carl; -- community admin, runs the groups
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.anna, 'anna'), (ids.carl, 'carl')) as u (id, name);
update public.members set state = 'approved' where user_id in (select unnest(array[anna, carl]) from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.photo(p_n text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'path', ids.biking || '/' || ids.anna || '/b0000000-0000-4000-8000-0000000000' || p_n || '.webp',
    'thumb_path', ids.biking || '/' || ids.anna || '/b0000000-0000-4000-8000-0000000000' || p_n || '_t.webp',
    'width', 1600, 'height', 1200, 'taken_in_app', false)
  from ids
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.photo(text) to authenticated;
create temp table saved (name text primary key, id uuid, value jsonb);
grant all on saved to authenticated;

insert into storage.objects (bucket_id, name)
select 'private', ids.biking || '/' || ids.anna || '/b0000000-0000-4000-8000-0000000000' || f.n || s.suffix
from ids cross join (values ('f1'), ('f2')) as f (n) cross join (values ('.webp'), ('_t.webp')) as s (suffix);

set local role authenticated;
select pg_temp.as_user(carl) from ids;
insert into saved (name, id) select 'g1', public.save_group(biking, null, '{"name": "Test Fix One", "require_app_image": true, "require_app_text": false}') from ids;
insert into saved (name, id) select 'g2', public.save_group(biking, null, '{"name": "Test Fix Two", "require_app_image": true, "require_app_text": false}') from ids;
select pg_temp.as_user(anna) from ids;
select public.apply_to_group(biking, (select id from saved where name = 'g1'), jsonb_build_object('photo', pg_temp.photo('f1'))) from ids;
select public.apply_to_group(biking, (select id from saved where name = 'g2'), jsonb_build_object('photo', pg_temp.photo('f2'))) from ids;

-- Adding someone directly closes their application, images included ------------------------------
select pg_temp.as_user(carl) from ids;
insert into saved (name, value) select 'add', public.set_group_member(biking, (select id from saved where name = 'g1'), anna, true) from ids;
select is((select jsonb_array_length(value -> 'files') from saved where name = 'add'), 2, 'adding Anna returns her application image''s two files to delete');
reset role;
select is((select status from public.applications where chat_id = (select id from saved where name = 'g1')), 'approved', 'her application is closed as approved');
select isnt((select media_deleted_at from public.applications where chat_id = (select id from saved where name = 'g1')), null, 'and marked "Checked and deleted"');
select is((select count(*)::int from public.photos where owner_id = (select anna from ids) and path like '%f1.webp'), 0, 'the photo row is gone');
set local role authenticated;
select pg_temp.as_user(carl) from ids;
select is((select jsonb_array_length(public.set_group_member(biking, (select id from saved where name = 'g1'), anna, false) -> 'files') from ids), 0,
  'taking her out again has no more images to delete');

-- Deleting a group deletes its applications' images ----------------------------------------------
select is((select jsonb_array_length(public.delete_group(biking, (select id from saved where name = 'g2')) -> 'files') from ids), 2,
  'deleting a group with an open application returns its image files');
reset role;
select is((select count(*)::int from public.photos where owner_id = (select anna from ids) and purpose = 'application'), 0, 'no application photo rows are left');
select is((select count(*)::int from public.applications where chat_id = (select id from saved where name = 'g2')), 0, 'the group''s applications are gone with it');

-- Join notices: once an hour per address --------------------------------------------------------
set local role service_role;
select is((select public.join_notice_due('Test.Notice@example.invalid')), true, 'the first notice to an address goes out');
select is((select public.join_notice_due(' test.notice@EXAMPLE.invalid ')), false, 'a second within the hour does not (same address, any case)');
reset role;
set local role authenticated;
select throws_ok($$ select public.join_notice_due('x@example.invalid') $$, '42501', null, 'browsers can''t call it');

select * from finish();
rollback;
