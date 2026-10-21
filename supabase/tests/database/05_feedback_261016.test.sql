begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '50000000-0000-4000-8000-00000000000a'::uuid as anna, -- approved member
  '50000000-0000-4000-8000-00000000000b'::uuid as bert, -- approved member
  '50000000-0000-4000-8000-00000000000c'::uuid as carl, -- approved member
  '50000000-0000-4000-8000-00000000000d'::uuid as dina; -- applicant
grant select on ids to anon, authenticated;

-- Sign-ups give their consents (step 5b); every community's version is 'test' here.
update public.communities set privacy_version = 'test';

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid', jsonb_build_object('community_id', ids.biking, 'username', initcap(u.name), 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dina, 'dina')) as u (id, name);

update public.members set state = 'approved' where user_id in (select unnest(array[anna, bert, carl]) from ids);
update public.communities set show_links = true, require_app_image = true, require_app_text = true, require_app_names = true
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
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;

insert into storage.objects (bucket_id, name)
select 'private', ids.biking || '/' || ids.dina || '/50000000-0000-4000-8000-0000000000f1' || s.suffix
from ids cross join (values ('.webp'), ('_t.webp')) as s (suffix);

-- Schema ---------------------------------------------------------------------------------------
select has_column('public', 'profile_links', 'comment', 'a link has a comment');

-- Anonymous ------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.set_profile_link_comment(biking, bert, 'Hi') from ids $$, '42501', null, 'anon cannot comment on a link');
select throws_ok($$ select public.my_application(biking) from ids $$, '42501', null, 'anon cannot read an application');
reset role;

-- Link comments --------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select lives_ok($$ select public.set_profile_link(biking, bert, true) from ids $$, 'Anna links to Bert');
select throws_ok($$ select public.set_profile_link_comment(biking, carl, 'Friend') from ids $$, '22023', null, 'no comment on a link you have not made');
select lives_ok($$ select public.set_profile_link_comment(biking, bert, '  My partner  ') from ids $$, 'Anna comments on her link to Bert');
select is(
  (select p -> 'links' -> 0 ->> 'comment' from (select public.profile(biking, anna) as p from ids) as x),
  'My partner', 'her own profile shows the comment, trimmed'
);
select throws_ok(
  $$ select public.set_profile_link_comment(biking, bert, repeat('x', 61)) from ids $$,
  '23514', null, 'a comment is short (60 characters at most)'
);
select throws_ok($$ select 1 from public.profile_links $$, '42501', null, 'links are still not readable directly');

select pg_temp.as_user(bert) from ids;
select lives_ok($$ select public.set_profile_link(biking, anna, true) from ids $$, 'Bert links back: the link is confirmed');
select is(
  (select p -> 'links' -> 0 ->> 'comment' from (select public.profile(biking, bert) as p from ids) as x),
  null, 'Bert''s own link has no comment of its own: each side writes their own'
);
select throws_ok($$ select public.set_profile_link_comment(biking, carl, 'x') from ids $$, '22023', null, 'Bert cannot comment on a link of Anna''s');

select pg_temp.as_user(carl) from ids;
select is(
  (select p -> 'links' -> 0 ->> 'comment' from (select public.profile(biking, anna) as p from ids) as x),
  'My partner', 'others see Anna''s comment next to the confirmed link'
);

select pg_temp.as_user(anna) from ids;
select lives_ok($$ select public.set_profile_link_comment(biking, bert, '') from ids $$, 'an empty comment clears it');

-- Your own application -------------------------------------------------------------------------
select pg_temp.as_user(dina) from ids;
select is((select public.my_application(biking) from ids), null, 'before applying there is nothing to read back');
select public.save_profile(
  biking, jsonb_build_object('status_id', (select o.id from public.community_options o where o.community_id = biking and o.list = 'status' and o.label ->> 'en' = 'Man')),
  jsonb_build_array(jsonb_build_object('field_id', (select f.id from public.profile_fields f where f.community_id = biking and f.key = 'about'), 'value', 'Gravel.'))
) from ids;
select public.submit_application(biking, jsonb_build_object(
  'photo', jsonb_build_object(
    'path', biking || '/' || dina || '/50000000-0000-4000-8000-0000000000f1.webp',
    'thumb_path', biking || '/' || dina || '/50000000-0000-4000-8000-0000000000f1_t.webp',
    'width', 1600, 'height', 1200, 'taken_in_app', true),
  'message', 'Sundays.', 'real_name_1', 'Dina Berg')) from ids;
select is(
  (select jsonb_build_array(a ->> 'status', a ->> 'message', a ->> 'real_name_1', a -> 'photo' ->> 'taken_in_app')
   from (select public.my_application(biking) as a from ids) as x),
  '["pending", "Sundays.", "Dina Berg", "true"]'::jsonb,
  'after applying, Dina reads back what she sent'
);

select pg_temp.as_user(anna) from ids;
select is((select public.my_application(biking) from ids), null, 'nobody else reads Dina''s application this way');

select * from finish();
rollback;
