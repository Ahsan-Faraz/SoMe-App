begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm' order by site limit 1) as biking,
  'a2500000-0000-4000-8000-00000000000a'::uuid as anna, -- community admin
  'a2500000-0000-4000-8000-00000000000b'::uuid as bert; -- member
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '25@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.anna, 'anna'), (ids.bert, 'bert')) as u (id, name);
update public.members set state = 'approved' where user_id in (select unnest(array[anna, bert]) from ids);
update public.members set role = 'admin' where user_id = (select anna from ids);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.start_file(p_n text) returns text language sql stable as $$
  select ids.biking || '/start/a2500000-0000-4000-8000-0000000000' || p_n || '.webp' from ids
$$;
create function pg_temp.save(p_start jsonb) returns text language sql as $$
  select public.save_community_start((select biking from ids), p_start)
$$;

set local role authenticated;

-- Upload -----------------------------------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('profile', pg_temp.start_file('b1')) $$,
  '42501', null, 'a member cannot upload a start page image'
);
select pg_temp.as_user(anna) from ids;
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('profile', pg_temp.start_file('a1')) $$,
  'the community admin uploads a start page image'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('profile', gen_random_uuid() || '/start/a2500000-0000-4000-8000-0000000000a2.webp') $$,
  '42501', null, 'not into another community''s start folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('profile', 'not-a-uuid/start/a2500000-0000-4000-8000-0000000000a3.webp') $$,
  '42501', null, 'a malformed path is refused, not an error'
);

-- Save -------------------------------------------------------------------------------------------
select lives_ok(
  $$ select pg_temp.save(jsonb_build_object('title', '  Ride with us  ', 'headline', 'Bikes and coffee',
       'about', jsonb_build_array(' First. ', '', 'Second.'), 'image', pg_temp.start_file('a1'))) $$,
  'the admin saves the start page with the new image'
);
select results_eq(
  $$ select start_title, headline, about, hero_path from public.communities, ids where id = ids.biking $$,
  $$ select 'Ride with us'::text, 'Bikes and coffee'::text, array['First.', 'Second.']::text[], pg_temp.start_file('a1') $$,
  'texts are trimmed, empty paragraphs dropped, the image set'
);
select is(
  pg_temp.save(jsonb_build_object('title', '', 'headline', 'Bikes', 'about', '[]'::jsonb)),
  null,
  'image left out: nothing to delete'
);
select results_eq(
  $$ select start_title, hero_path from public.communities, ids where id = ids.biking $$,
  $$ select null::text, pg_temp.start_file('a1') $$,
  'an empty title falls back to the name, and the image is kept'
);

insert into storage.objects (bucket_id, name) values ('profile', pg_temp.start_file('a4'));
select is(
  pg_temp.save(jsonb_build_object('headline', 'Bikes', 'about', '[]'::jsonb, 'image', pg_temp.start_file('a4'))),
  pg_temp.start_file('a1'),
  'a replaced uploaded image is returned for deleting'
);
select is(
  pg_temp.save(jsonb_build_object('headline', 'Bikes', 'about', '[]'::jsonb, 'image', null)),
  pg_temp.start_file('a4'),
  'back to the built-in picture: the uploaded one is returned'
);
select is((select hero_path from public.communities, ids where id = ids.biking), null, 'and hero_path is empty');

select throws_ok(
  $$ select pg_temp.save(jsonb_build_object('headline', 'Bikes', 'about', '[]'::jsonb, 'image', pg_temp.start_file('a9'))) $$,
  '22023', null, 'an image that was never uploaded is refused'
);
select throws_ok(
  $$ select pg_temp.save(jsonb_build_object('headline', 'Bikes', 'about', '[]'::jsonb, 'image', '/community/hero.png')) $$,
  '22023', null, 'a path outside the start folder is refused'
);
select throws_ok(
  $$ select pg_temp.save(jsonb_build_object('headline', 'Bikes', 'about', jsonb_build_array(repeat('x', 4001)))) $$,
  '22001', null, 'more than 4000 characters of info text is refused'
);
select throws_ok(
  $$ select pg_temp.save(jsonb_build_object('headline', 'Bikes', 'about', 'text')) $$,
  '22023', null, 'about must be a list of paragraphs'
);

select pg_temp.as_user(bert) from ids;
select throws_ok(
  $$ select pg_temp.save(jsonb_build_object('headline', 'Mine now', 'about', '[]'::jsonb)) $$,
  '42501', null, 'a member cannot change the start page'
);
reset role;

select * from finish();
rollback;
