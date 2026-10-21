begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '71000000-0000-4000-8000-00000000000a'::uuid as anna, -- applicant: approved here
  '71000000-0000-4000-8000-00000000000b'::uuid as bert, -- applicant: rejected here
  '71000000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  '71000000-0000-4000-8000-00000000000d'::uuid as dina, -- applicant: "later", then removed
  '71000000-0000-4000-8000-00000000000e'::uuid as erik; -- approved member
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
update public.communities set require_age_18 = true, require_identity = true,
  require_app_image = true, require_app_text = false, require_app_names = false
where slug = 'biking-stockholm';

-- Only the seeded fields count as required here (an admin may have added more on the live project).
update public.profile_fields f set active = false
from ids
where f.community_id = ids.biking and f.key not in (
  'headline', 'about', 'about_us', 'bike_type', 'ride_days', 'ride_style', 'rides_per_month', 'riding_since', 'own_bike', 'ride_together', 'area', 'bike_photo'
);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.signup(p_id uuid, p_name text, p_consents jsonb) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  select p_id, lower(p_name) || '@test.invalid', jsonb_build_object('community_id', ids.biking, 'username', p_name, 'consents', p_consents) from ids
$$;
-- An image's files in the private bucket: {community}/{owner}/{file}.webp and _t.webp.
create function pg_temp.photo(p_owner uuid, p_file text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'path', ids.biking || '/' || p_owner || '/' || p_file || '.webp',
    'thumb_path', ids.biking || '/' || p_owner || '/' || p_file || '_t.webp',
    'width', 1600, 'height', 1200, 'taken_in_app', true)
  from ids
$$;
create function pg_temp.apply(p_owner uuid, p_n text, p_identity boolean default true) returns uuid language sql as $$
  select public.submit_application((select biking from ids), jsonb_build_object(
    'photo', pg_temp.photo(p_owner, '71000000-0000-4000-8000-0000000000' || p_n || '1'))
    || case when p_identity then jsonb_build_object('id_photo', pg_temp.photo(p_owner, '71000000-0000-4000-8000-0000000000' || p_n || '2')) else '{}' end)
$$;
create function pg_temp.complete_profile() returns void language sql as $$
  select public.save_profile((select biking from ids),
    jsonb_build_object('status_id', (select o.id from public.community_options o, ids where o.community_id = ids.biking and o.list = 'status' and o.label ->> 'en' = 'Man')),
    jsonb_build_array(jsonb_build_object('field_id', (select f.id from public.profile_fields f, ids where f.community_id = ids.biking and f.key = 'about'), 'value', 'Road and gravel.')))
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.photo(uuid, text), pg_temp.apply(uuid, text, boolean), pg_temp.complete_profile() to authenticated;

create temp table saved (name text primary key, value jsonb);
grant all on saved to authenticated;

-- Uploaded files (Storage rows), as the upload API would make them: an image and an ID photo each.
insert into storage.objects (bucket_id, name)
select 'private', ids.biking || '/' || f.owner || '/71000000-0000-4000-8000-0000000000' || f.n || x.k || s.suffix
from ids
cross join lateral (values (ids.anna, 'a'), (ids.bert, 'b'), (ids.dina, 'd')) as f (owner, n)
cross join (values ('1'), ('2')) as x (k)
cross join (values ('.webp'), ('_t.webp')) as s (suffix);

-- Schema ---------------------------------------------------------------------------------------
select has_column('public', 'communities', 'domain', 'a community can have its own domain');
select has_column('public', 'communities', 'require_identity', 'communities can require an identity check');
select has_table('public', 'member_consents', 'member_consents table exists');
select throws_ok($$ update public.communities set domain = 'Not A Domain' where slug = 'biking-stockholm' $$, '23514', null, 'a domain is a lower-case host name');
select lives_ok($$ update public.communities set domain = 'club-example.test' where slug = 'biking-stockholm' $$, 'a valid domain is accepted');

-- Sign-up with consents ------------------------------------------------------------------------
select throws_ok($$ select pg_temp.signup('71000000-0000-4000-8000-0000000000f1', 'Nocon', '{}') $$, '23502', null, 'no sign-up without the consents');
select throws_ok($$ select pg_temp.signup('71000000-0000-4000-8000-0000000000f2', 'Oldver', '{"privacy": "old", "age_18": true}') $$, '23502', null,
  'consent to an older privacy text is refused (reload and agree again)');
select throws_ok($$ select pg_temp.signup('71000000-0000-4000-8000-0000000000f3', 'Noage', '{"privacy": "test"}') $$, '23502', null,
  'the community requires 18+: no sign-up without it');
select lives_ok($$ select pg_temp.signup(anna, 'Anna', '{"privacy": "test", "age_18": true}') from ids $$, 'sign-up with every consent');
select results_eq(
  $$ select kind, version from public.member_consents where user_id = (select anna from ids) order by kind $$,
  $$ values ('age_18'::text, '1'::text), ('privacy', 'test') $$,
  'each consent is stored with its version'
);
select pg_temp.signup(u.id, u.name, '{"privacy": "test", "age_18": true}')
from ids cross join lateral (values (ids.bert, 'Bert'), (ids.carl, 'Carl'), (ids.dina, 'Dina'), (ids.erik, 'Erik')) as u (id, name);
update public.members set state = 'approved' where user_id = (select erik from ids);
update public.members set state = 'approved', role = 'admin' where user_id = (select carl from ids);

-- Consents: read own (and the admin), never written directly ------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select is((select count(*)::int from public.member_consents), 2, 'a member reads their own consents');
select throws_ok($$ insert into public.member_consents (community_id, user_id, kind, version) select biking, anna, 'privacy', 'x' from ids $$,
  '42501', null, 'consents are never written directly');
select throws_ok($$ select private.save_consents(biking, anna, '{}') from ids $$, '42501', null, 'the consent helper is not callable');
select pg_temp.as_user(erik) from ids;
select is((select count(*)::int from public.member_consents where user_id = (select anna from ids)), 0, 'other members can''t read them');
select pg_temp.as_user(carl) from ids;
select is((select count(*)::int from public.member_consents where user_id = (select anna from ids)), 2, 'the community admin can');

-- Identity check -------------------------------------------------------------------------------
select pg_temp.as_user(anna) from ids;
select lives_ok($$ select pg_temp.complete_profile() $$, 'Anna fills in her profile');
select throws_ok($$ select pg_temp.apply(anna, 'a', false) from ids $$, '23502', null, 'the community requires an ID photo: refused without it');
select lives_ok($$ insert into saved select 'anna', to_jsonb(pg_temp.apply(anna, 'a')) from ids $$, 'Anna applies with her image and ID photo');
select is(
  (select public.my_application(biking) -> 'id_photo' ->> 'taken_in_app' from ids), 'true',
  'she sees the ID photo she sent'
);
select pg_temp.as_user(carl) from ids;
select isnt((select public.admin_member(biking, anna) -> 'application' -> 'id_photo' ->> 'path' from ids), null, 'the admin gets the ID photo to check (signed by the server)');

-- Deciding deletes the images ------------------------------------------------------------------
insert into saved select 'approve', public.decide_application((select (value #>> '{}')::uuid from saved where name = 'anna'), 'approved');
select is(
  (select jsonb_array_length(value -> 'files') from saved where name = 'approve'), 4,
  'approving returns both images'' files (image and thumbnail each) to delete from Storage'
);
select ok(
  (select bool_and(f #>> '{}' like (select biking from ids) || '/' || (select anna from ids) || '/%') from saved, jsonb_array_elements(value -> 'files') as f where name = 'approve'),
  'only Anna''s own files'
);
select results_eq(
  $$ select a -> 'photo', a -> 'id_photo', a ->> 'media_deleted_at' is not null, a ->> 'decided_by'
     from (select public.admin_member(biking, anna) -> 'application' as a from ids) as x $$,
  $$ values ('null'::jsonb, 'null'::jsonb, true, 'Carl'::text) $$,
  'A21 then shows "Checked and deleted": no images, the date and who decided'
);
reset role;
select is((select count(*)::int from public.photos where owner_id = (select anna from ids) and purpose in ('application', 'identity')), 0, 'the photo rows are gone');
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select is((select public.my_application(biking) -> 'id_photo' from ids), 'null'::jsonb, 'the applicant no longer sees the ID photo either');

select pg_temp.as_user(bert) from ids;
select lives_ok($$ select pg_temp.complete_profile() $$, 'Bert fills in his profile');
insert into saved select 'bert', to_jsonb(pg_temp.apply(bert, 'b')) from ids;
select pg_temp.as_user(dina) from ids;
select lives_ok($$ select pg_temp.complete_profile() $$, 'Dina fills in her profile');
insert into saved select 'dina', to_jsonb(pg_temp.apply(dina, 'd')) from ids;

select pg_temp.as_user(carl) from ids;
select is(
  (select jsonb_array_length(public.decide_application((select (value #>> '{}')::uuid from saved where name = 'bert'), 'rejected') -> 'files')),
  4, 'rejecting deletes the images too'
);
select is(
  (select jsonb_array_length(public.decide_application((select (value #>> '{}')::uuid from saved where name = 'dina'), 'later') -> 'files')),
  0, '"Later" keeps them (the application is still open)'
);
select isnt((select public.admin_member(biking, dina) -> 'application' -> 'id_photo' from ids), 'null'::jsonb, 'Dina''s ID photo is still there to check');
select is(
  (select jsonb_array_length(public.remove_member(biking, dina) -> 'files') from ids),
  4, 'removing someone with an open application deletes its images'
);
reset role;
select is((select count(*)::int from public.photos where purpose in ('application', 'identity') and owner_id in (select unnest(array[anna, bert, dina]) from ids)), 0,
  'no application or identity photo rows are left');
select is((select count(*)::int from public.applications where user_id in (select unnest(array[anna, bert, dina]) from ids) and media_deleted_at is null), 0,
  'every decided application is marked "Checked and deleted"');

-- Joining a second community -------------------------------------------------------------------
insert into public.communities (slug, name, headline, require_age_18, privacy_version) values ('test-other-5b', 'Other', 'Another community', true, 'v2');
set local role authenticated;
select pg_temp.as_user(erik) from ids;
select throws_ok($$ select public.join_community(c.id, 'Erik', '{"privacy": "v2"}') from public.communities c where c.slug = 'test-other-5b' $$,
  '23502', null, 'joining a community that requires 18+ needs it');
select lives_ok($$ select public.join_community(c.id, 'Erik', '{"privacy": "v2", "age_18": true}') from public.communities c where c.slug = 'test-other-5b' $$,
  'with every consent, the second account is created');
select results_eq(
  $$ select m.state, (select count(*)::int from public.member_consents mc where mc.community_id = m.community_id and mc.user_id = m.user_id)
     from public.members m join public.communities c on c.id = m.community_id
     where c.slug = 'test-other-5b' and m.user_id = (select erik from ids) $$,
  $$ values ('profile'::text, 2) $$,
  'it starts as a new applicant there, with its consents'
);
select throws_ok($$ select public.join_community(c.id, 'Erik2', '{"privacy": "v2", "age_18": true}') from public.communities c where c.slug = 'test-other-5b' $$,
  '23505', null, 'one account per community');

reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.join_community(c.id, 'Nobody', '{"privacy": "v2", "age_18": true}') from public.communities c where c.slug = 'test-other-5b' $$,
  '42501', null, 'joining needs a login');

select * from finish();
rollback;
