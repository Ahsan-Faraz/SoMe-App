begin;
create extension if not exists pgtap with schema extensions;

select plan(49);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '40000000-0000-4000-8000-00000000000a'::uuid as anna, -- applicant, approved here
  '40000000-0000-4000-8000-00000000000b'::uuid as bert, -- applicant, rejected here
  '40000000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  '40000000-0000-4000-8000-00000000000d'::uuid as dora, -- admin of another community
  '40000000-0000-4000-8000-00000000000e'::uuid as erik, -- approved member, removed here
  '40000000-0000-4000-8000-00000000000f'::uuid as fred; -- applicant, "later"
grant select on ids to anon, authenticated;

insert into public.communities (slug, name, headline) values ('test-other', 'Other', 'Another community');

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', case when u.name = 'dora' then (select id from public.communities where slug = 'test-other') else ids.biking end,
    'username', initcap(u.name))
from ids cross join lateral (values
  (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dora, 'dora'), (ids.erik, 'erik'), (ids.fred, 'fred')
) as u (id, name);

update public.members set state = 'approved' where user_id = (select erik from ids);
update public.members set state = 'approved', role = 'admin' where user_id in (select unnest(array[carl, dora]) from ids);
-- The community asks for the image, the message and real names (the defaults).
update public.communities set require_app_image = true, require_app_text = true, require_app_names = true where slug = 'biking-stockholm';

-- Fields an admin added on the live project would change what is required: only the seeded ones count here.
update public.profile_fields f set active = false
from ids
where f.community_id = ids.biking and f.key not in (
  'headline', 'about', 'about_us', 'bike_type', 'ride_days', 'ride_style', 'rides_per_month', 'riding_since', 'own_bike', 'ride_together', 'area', 'bike_photo'
);

create function pg_temp.status(p_label text) returns uuid language sql stable as $$
  select o.id from public.community_options o join ids on o.community_id = ids.biking where o.list = 'status' and o.label ->> 'en' = p_label
$$;
create function pg_temp.field(p_key text) returns uuid language sql stable as $$
  select f.id from public.profile_fields f join ids on f.community_id = ids.biking where f.key = p_key
$$;
-- An application image's files in the private bucket: {community}/{owner}/{file}.webp and _t.webp.
create function pg_temp.photo(p_owner uuid, p_file text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'path', ids.biking || '/' || p_owner || '/' || p_file || '.webp',
    'thumb_path', ids.biking || '/' || p_owner || '/' || p_file || '_t.webp',
    'width', 1600, 'height', 1200, 'taken_in_app', true)
  from ids
$$;
create function pg_temp.application(p_owner uuid, p_file text, p_names boolean default true) returns jsonb language sql stable as $$
  select jsonb_build_object('photo', pg_temp.photo(p_owner, p_file), 'message', '  I ride gravel on Sundays.  ')
    || case when p_names then '{"real_name_1": "Anna Lind", "real_name_2": " "}'::jsonb else '{}'::jsonb end
$$;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
-- A profile with a Status and every required field filled ("About the riding" for singles).
create function pg_temp.complete_profile() returns void language sql as $$
  select public.save_profile((select biking from ids), jsonb_build_object('status_id', pg_temp.status('Man')),
    jsonb_build_array(jsonb_build_object('field_id', pg_temp.field('about'), 'value', 'Road and gravel.')))
$$;
grant execute on function pg_temp.status(text), pg_temp.field(text), pg_temp.photo(uuid, text), pg_temp.application(uuid, text, boolean),
  pg_temp.as_user(uuid), pg_temp.complete_profile() to anon, authenticated;

-- Uploaded files (Storage rows), made here as the upload API would.
insert into storage.objects (bucket_id, name)
select 'private', ids.biking || '/' || f.owner || '/' || f.file || s.suffix
from ids
cross join lateral (values
  (ids.anna, '40000000-0000-4000-8000-0000000000f1'),
  (ids.bert, '40000000-0000-4000-8000-0000000000f2'),
  (ids.fred, '40000000-0000-4000-8000-0000000000f3')
) as f (owner, file)
cross join (values ('.webp'), ('_t.webp')) as s (suffix);
-- A file in the public bucket: an application image must be private.
insert into storage.objects (bucket_id, name)
select 'profile', ids.biking || '/' || ids.bert || '/40000000-0000-4000-8000-0000000000f9' || s.suffix
from ids cross join (values ('.webp'), ('_t.webp')) as s (suffix);

create temp table saved (name text primary key, value jsonb);
grant all on saved to authenticated;

-- Schema ---------------------------------------------------------------------------------------
select has_table('public', 'applications', 'applications table exists');
select has_table('public', 'admin_records', 'admin_records table exists');
select is((select public from storage.buckets where id = 'private'), false, 'the private bucket is private (signed URLs only)');

-- Anonymous ------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.submit_application(biking, '{}') from ids $$, '42501', null, 'anon cannot apply');
reset role;

-- Anna applies ---------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select throws_ok(
  $$ insert into public.applications (community_id, user_id) select biking, anna from ids $$,
  '42501', null, 'an application cannot be written directly'
);
select throws_ok(
  $$ select public.submit_application(biking, '{"message": "Hi", "real_name_1": "Anna"}') from ids $$,
  '23502', null, 'the image the community asks for must be there'
);
select throws_ok(
  $$ select public.submit_application(biking, pg_temp.application(anna, '40000000-0000-4000-8000-0000000000f1')) from ids $$,
  '23514', null, 'the profile''s required fields must be filled first'
);
select lives_ok($$ select pg_temp.complete_profile() $$, 'Anna sets her Status and fills in the required field');
select lives_ok(
  $$ select public.submit_application(biking, pg_temp.application(anna, '40000000-0000-4000-8000-0000000000f1')) from ids $$,
  'Anna applies with an image, a message and her real name'
);
select is((select public.profile(biking, anna) ->> 'state' from ids), 'applied', 'she is now an applicant who has applied');
select results_eq(
  $$ select message, real_name_1, real_name_2, status, photo_id is not null from public.applications $$,
  $$ values ('I ride gravel on Sundays.'::text, 'Anna Lind'::text, null::text, 'pending'::text, true) $$,
  'she reads her own application: trimmed, an empty second name is no name'
);
select throws_ok(
  $$ select public.submit_application(biking, pg_temp.application(anna, '40000000-0000-4000-8000-0000000000f1')) from ids $$,
  '23505', null, 'applying twice is not possible'
);

-- Bert and Fred apply -------------------------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
select lives_ok($$ select pg_temp.complete_profile() $$, 'Bert fills in his profile');
select throws_ok(
  $$ select public.submit_application(biking, pg_temp.application(bert, '40000000-0000-4000-8000-0000000000f2', false)) from ids $$,
  '23502', null, 'the real name the community asks for must be there'
);
select throws_ok(
  $$ select public.submit_application(biking, jsonb_build_object('photo', pg_temp.photo(bert, '40000000-0000-4000-8000-0000000000f9'),
       'message', 'Hi', 'real_name_1', 'Bert')) from ids $$,
  '22023', null, 'an application image must be uploaded to the private bucket'
);
select is_empty($$ select 1 from public.applications where user_id <> (select bert from ids) $$, 'an applicant cannot read others'' applications');
select lives_ok(
  $$ select public.submit_application(biking, pg_temp.application(bert, '40000000-0000-4000-8000-0000000000f2')) from ids $$,
  'Bert applies'
);
select pg_temp.as_user(fred) from ids;
select lives_ok(
  $$ select pg_temp.complete_profile(), public.submit_application(biking, pg_temp.application(fred, '40000000-0000-4000-8000-0000000000f3')) from ids $$,
  'Fred applies'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) select 'private', biking || '/' || anna || '/40000000-0000-4000-8000-0000000000aa.webp' from ids $$,
  '42501', null, 'nobody uploads into someone else''s private folder'
);

-- Erik, approved member -------------------------------------------------------------------------------
select pg_temp.as_user(erik) from ids;
select is_empty($$ select 1 from public.applications $$, 'a member cannot read applications');
select is_empty($$ select 1 from public.admin_records $$, 'a member cannot read real names or admin records');
select throws_ok($$ select * from ids, public.admin_roster(ids.biking, true) $$, '42501', null, 'a member cannot open the admin queue');
select throws_ok(
  $$ select public.decide_application((select a.id from public.applications a), 'approved') $$,
  '42501', null, 'a member cannot decide an application by id'
);
select throws_ok($$ select public.save_admin_record(biking, anna, '{"notes": "x"}') from ids $$, '42501', null, 'a member cannot write admin records');

-- Dora, admin of another community ---------------------------------------------------------------------
select pg_temp.as_user(dora) from ids;
select throws_ok($$ select * from ids, public.admin_roster(ids.biking, true) $$, '42501', null, 'an admin elsewhere cannot open this queue');
select is_empty($$ select 1 from public.applications a join ids on a.community_id = ids.biking $$, 'an admin elsewhere reads none of these applications');

-- Carl, community admin ---------------------------------------------------------------------------------
select pg_temp.as_user(carl) from ids;
select results_eq(
  $$ select r.username, r.message, r.real_name_1 from public.admin_roster((select biking from ids), true) as r
     where r.user_id in (select unnest(array[anna, bert, fred]) from ids) order by r.username $$,
  $$ values ('Anna'::text, 'I ride gravel on Sundays.'::text, 'Anna Lind'::text), ('Bert', 'I ride gravel on Sundays.', 'Anna Lind'), ('Fred', 'I ride gravel on Sundays.', 'Anna Lind') $$,
  'the admin queue lists the applications with their message and real names'
);
select results_eq(
  $$ select p ->> 'state', p -> 'application' ->> 'status', p -> 'application' -> 'photo' ->> 'taken_in_app',
       (p -> 'application' -> 'photo' ->> 'path') like '%/40000000-0000-4000-8000-0000000000f1.webp', p -> 'record'
     from (select public.admin_member(biking, anna) as p from ids) as x $$,
  $$ values ('applied'::text, 'pending'::text, 'true'::text, true, 'null'::jsonb) $$,
  'A21: the admin sees the application with its image (path for signing) and no record yet'
);
insert into saved select 'approved', public.decide_application((select id from public.applications where user_id = (select anna from ids)), 'approved');
select is((select value ->> 'email' from saved where name = 'approved'), 'anna@test.invalid', 'approving returns the address for the approval email');
select is((select state from public.members where user_id = (select anna from ids)), 'approved', 'the member now has full access');
select results_eq(
  $$ select real_name_1, real_name_2 from public.admin_records where user_id = (select anna from ids) $$,
  $$ values ('Anna Lind'::text, null::text) $$,
  'the real names are copied to the community''s admin record'
);
select ok(
  (select bool_or(r.user_id = (select anna from ids)) from public.admin_roster((select biking from ids), false) as r),
  'she is in the members list now'
);
select ok(
  not (select coalesce(bool_or(r.user_id = (select anna from ids)), false) from public.admin_roster((select biking from ids), true) as r),
  '...and no longer in the queue'
);
select throws_ok(
  $$ select public.decide_application((select id from public.applications where user_id = (select anna from ids)), 'rejected') $$,
  '23514', null, 'a decided application cannot be decided again'
);
select lives_ok(
  $$ select public.decide_application((select id from public.applications where user_id = (select fred from ids)), 'later') $$,
  'the admin leaves Fred for later'
);
select results_eq(
  $$ select (select state from public.members where user_id = ids.fred), coalesce(bool_or(r.user_id = ids.fred), false)
     from ids left join public.admin_roster(ids.biking, true) as r on true group by ids.fred $$,
  $$ values ('applied'::text, true) $$,
  '"later" keeps him in the queue, still applied'
);
select lives_ok(
  $$ select public.decide_application((select id from public.applications where user_id = (select bert from ids)), 'rejected') $$,
  'the admin rejects Bert'
);
select is((select state from public.members where user_id = (select bert from ids)), 'rejected', 'a rejected applicant loses access');

-- Admin records.
select lives_ok(
  $$ select public.save_admin_record(biking, anna, '{"state_1": 300, "state_2": "12", "notes": " Paid in cash "}') from ids $$,
  'the admin fills in profile states and notes'
);
select results_eq(
  $$ select r.state_1, r.state_2, r.state_3, r.notes, r.real_name_1 from public.admin_roster((select biking from ids), false) as r
     where r.user_id = (select anna from ids) $$,
  $$ values (300, 12, null::integer, 'Paid in cash'::text, 'Anna Lind'::text) $$,
  'the members list shows them; untouched fields keep their value'
);
select lives_ok($$ select public.save_admin_record(biking, anna, '{"notes": "", "real_name_2": "Sara Lind"}') from ids $$, 'clearing the note, adding a second name');
select results_eq(
  $$ select notes, real_name_2 from public.admin_records where user_id = (select anna from ids) $$,
  $$ values (null::text, 'Sara Lind'::text) $$,
  'an empty value clears it'
);
select throws_ok($$ select public.save_admin_record(biking, anna, '{"role": "admin"}') from ids $$, '22023', null, 'only record fields can be written');
select throws_ok($$ select public.save_admin_record(biking, anna, '{"state_1": "lots"}') from ids $$, '22P02', null, 'a profile state is a whole number');

-- Removing a member.
select throws_ok($$ select public.remove_member(biking, carl) from ids $$, '42501', null, 'the admin cannot remove themself');
select lives_ok($$ select public.remove_member(biking, erik) from ids $$, 'the admin removes Erik');
select is((select public.admin_member(biking, erik) from ids), null, 'a removed member has no admin view');

select pg_temp.as_user(erik) from ids;
select is((select public.profile(biking, erik) from ids), null, 'a removed member has lost access');

-- Anna, approved: her own real names stay the admin's.
select pg_temp.as_user(anna) from ids;
select is_empty($$ select 1 from public.admin_records $$, 'a member cannot read their own admin record');

select * from finish();
rollback;
