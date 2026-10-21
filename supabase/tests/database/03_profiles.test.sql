begin;
create extension if not exists pgtap with schema extensions;

select plan(84);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '30000000-0000-4000-8000-00000000000a'::uuid as anna, -- approved member
  '30000000-0000-4000-8000-00000000000b'::uuid as bert, -- applicant
  '30000000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  '30000000-0000-4000-8000-00000000000d'::uuid as dora, -- admin of another community
  '30000000-0000-4000-8000-00000000000e'::uuid as erik, -- approved member
  '30000000-0000-4000-8000-00000000000f'::uuid as fred, -- approved member, hidden from search
  '30000000-0000-4000-8000-000000000010'::uuid as gina; -- approved member
grant select on ids to anon, authenticated;

insert into public.communities (slug, name, headline) values ('test-other', 'Other', 'Another community');

-- Sign-ups give their consents (step 5b); every community's version is 'test' here.
update public.communities set privacy_version = 'test';

insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', case when u.name = 'dora' then (select id from public.communities where slug = 'test-other') else ids.biking end,
    'username', initcap(u.name), 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values
  (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dora, 'dora'), (ids.erik, 'erik'), (ids.fred, 'fred'), (ids.gina, 'gina')
) as u (id, name);

update public.members set state = 'approved'
where user_id in (select unnest(array[anna, erik, fred, gina]) from ids);
update public.members set state = 'approved', role = 'admin' where user_id in (select unnest(array[carl, dora]) from ids);

-- Fields an admin added on the live project would change the score: only the seeded ones count here.
update public.profile_fields f set active = false
from ids
where f.community_id = ids.biking and f.key not in (
  'headline', 'about', 'about_us', 'bike_type', 'ride_days', 'ride_style', 'rides_per_month', 'riding_since', 'own_bike', 'ride_together', 'area', 'bike_photo'
);

-- Shorthands for Biking Stockholm's rows.
create function pg_temp.option(p_list text, p_label text) returns uuid language sql stable as $$
  select o.id from public.community_options o join ids on o.community_id = ids.biking
  where o.list = p_list and o.label ->> 'en' = p_label
$$;
create function pg_temp.status(p_label text) returns uuid language sql stable as $$ select pg_temp.option('status', p_label) $$;
create function pg_temp.sub(p_label text) returns uuid language sql stable as $$ select pg_temp.option('substatus', p_label) $$;
create function pg_temp.field(p_key text) returns uuid language sql stable as $$
  select f.id from public.profile_fields f join ids on f.community_id = ids.biking where f.key = p_key
$$;
create function pg_temp.choice(p_key text, p_label text) returns uuid language sql stable as $$
  select o.id from public.profile_field_options o where o.field_id = pg_temp.field(p_key) and o.label ->> 'en' = p_label
$$;
-- One answer for save_profile: no substatus = the main section.
create function pg_temp.answer(p_key text, p_value jsonb, p_sub text default null, p_n integer default null) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object('field_id', pg_temp.field(p_key), 'substatus_id', pg_temp.sub(p_sub), 'n', coalesce(p_n, case when p_sub is null then null else 1 end)))
    || jsonb_build_object('value', p_value)
$$;
-- A photo's files as the upload puts them: {community}/{owner}/{file}.webp and _t.webp.
create function pg_temp.photo(p_owner uuid, p_file text, p_taken boolean) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'path', ids.biking || '/' || p_owner || '/' || p_file || '.webp',
    'thumb_path', ids.biking || '/' || p_owner || '/' || p_file || '_t.webp',
    'width', 1600, 'height', 1200, 'taken_in_app', p_taken)
  from ids
$$;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.option(text, text), pg_temp.status(text), pg_temp.sub(text), pg_temp.field(text), pg_temp.choice(text, text),
  pg_temp.answer(text, jsonb, text, integer), pg_temp.photo(uuid, text, boolean), pg_temp.as_user(uuid) to anon, authenticated;

-- A second country with a district, and a field shown only in The Man's section.
insert into public.community_options (community_id, list, label, position) select biking, 'country', '{"en": "Norway"}', 1 from ids;
insert into public.community_options (community_id, list, label, position, parent_id)
select biking, 'district', '{"en": "Oslo"}', 0, pg_temp.option('country', 'Norway') from ids;
insert into public.profile_fields (community_id, key, label, kind, for_substatuses, position)
select biking, 'fixture_male_level', '{"en": "Male competition level"}', 'short_text', array[pg_temp.sub('The Man')], 900 from ids;

-- Gina picked a District before countries existed: she has no Country.
update public.members set district_id = pg_temp.option('district', 'Stockholm') where user_id = (select gina from ids);

-- Uploaded files (Storage rows), made here as the upload API would.
insert into storage.objects (bucket_id, name)
select 'profile', ids.biking || '/' || f.owner || '/' || f.file || s.suffix
from ids
cross join lateral (values
  (ids.anna, '30000000-0000-4000-8000-0000000000f1'),
  (ids.anna, '30000000-0000-4000-8000-0000000000f2'),
  (ids.anna, '30000000-0000-4000-8000-0000000000f3'),
  (ids.erik, '30000000-0000-4000-8000-0000000000f4')
) as f (owner, file)
cross join (values ('.webp'), ('_t.webp')) as s (suffix);

-- 200+ characters: a long text answer that counts towards the score.
create temp table long_text as select repeat('Gravel and long Sunday rides. ', 8) as body;
grant select on long_text to authenticated;
create temp table anna_profile (p jsonb);
grant all on anna_profile to authenticated;

-- Schema ---------------------------------------------------------------------------------------
select has_table('public', 'photos', 'photos table exists');
select has_table('public', 'profile_values', 'profile_values table exists');
select has_table('public', 'profile_people', 'profile_people table exists (a birth date per person)');
select has_table('public', 'profile_links', 'profile_links table exists');
select is((select public from storage.buckets where id = 'profile'), true, 'the profile bucket is public (unguessable URLs)');

-- Anonymous ------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.profile(biking, anna) from ids $$, '42501', null, 'anon cannot read a profile');
reset role;

-- Anna, approved member: her own profile -------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;

select throws_ok($$ select 1 from public.profile_values $$, '42501', null, 'answers cannot be read directly');
select throws_ok($$ select 1 from public.profile_people $$, '42501', null, 'birth dates cannot be read directly');
select throws_ok($$ select 1 from public.photos $$, '42501', null, 'photos cannot be read directly');
select throws_ok(
  $$ update public.members set score = 100 where user_id = (select anna from ids) $$,
  '42501', null, 'a member cannot set their own score'
);
select throws_ok(
  $$ update public.members set status_id = pg_temp.status('Man') where user_id = (select anna from ids) $$,
  '42501', null, 'a member cannot set their Status directly'
);

select is((select public.profile(biking, anna) ->> 'status_id' from ids), null, 'a new profile has no Status yet');
select isnt((select public.profile(biking, anna) ->> 'created_at' from ids), null, 'your account''s creation date is stored and shown to you');
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('area', '"Södermalm"'))) from ids $$,
  '22023', null, 'no answers before a Status is set (it decides the fields)'
);
select throws_ok(
  $$ select public.save_profile(biking, jsonb_build_object('status_id', pg_temp.option('district', 'Gotland')), '[]') from ids $$,
  '22023', null, 'a District is not a Status'
);
select lives_ok(
  $$ select public.save_profile(biking, jsonb_build_object(
       'status_id', pg_temp.status('Man'), 'country_id', pg_temp.option('country', 'Sweden'), 'district_id', pg_temp.option('district', 'Stockholm'),
       'place', ' Södermalm ', 'looking_for', jsonb_build_array(pg_temp.status('Woman'), pg_temp.status('Couple MF')),
       'birth_dates', jsonb_build_array(jsonb_build_object('substatus_id', pg_temp.sub('The Man'), 'n', 1, 'date', '1990-05-01'))), '[]') from ids $$,
  'a member sets Status, Country, District, Place, Looking for and a birth date'
);
select results_eq(
  $$ select jsonb_array_length(p -> 'people'), p -> 'people' -> 0 ->> 'birth_date', p ->> 'place'
     from (select public.profile(biking, anna) as p from ids) as x $$,
  $$ values (1, '1990-05-01'::text, 'Södermalm'::text) $$,
  'a single is one person with a birth date; Place is trimmed'
);
select throws_ok(
  $$ select public.save_profile(biking, jsonb_build_object('birth_dates', jsonb_build_array(
       jsonb_build_object('substatus_id', pg_temp.sub('The Woman'), 'n', 1, 'date', '1991-01-01'))), '[]') from ids $$,
  '22023', null, 'a birth date for a person the Status doesn''t have is refused'
);
select throws_ok(
  $$ select public.save_profile(biking, jsonb_build_object('birth_dates', jsonb_build_array(
       jsonb_build_object('substatus_id', pg_temp.sub('The Man'), 'n', 1, 'date', '2999-01-01'))), '[]') from ids $$,
  '22023', null, 'a birth date cannot be in the future'
);
select throws_ok(
  $$ select public.save_profile(biking, jsonb_build_object('district_id', pg_temp.option('district', 'Oslo')), '[]') from ids $$,
  '22023', null, 'the District must be in the chosen Country'
);
select throws_ok(
  $$ select public.save_profile(biking, jsonb_build_object('status_id', pg_temp.status('Woman')), '[]') from ids $$,
  '42501', null, 'Status is set once: the member cannot change it'
);
select throws_ok(
  $$ select public.set_member_status(biking, anna, pg_temp.status('Woman')) from ids $$,
  '42501', null, 'a member cannot use the admin''s Status change'
);

-- Carl, admin: changes Anna's Status to a couple -------------------------------------------------
select pg_temp.as_user(carl) from ids;
select lives_ok($$ select public.set_member_status(biking, anna, pg_temp.status('Couple MF')) from ids $$, 'the community admin changes a member''s Status');
select isnt((select public.profile(biking, anna) ->> 'created_at' from ids), null, 'the admin sees when the account was created');

-- Anna: a couple now. Main section + The Man + The Woman. ---------------------------------------
select pg_temp.as_user(anna) from ids;
select results_eq(
  $$ select (pe ->> 'substatus_id')::uuid, (pe ->> 'n')::int, pe ->> 'birth_date'
     from (select public.profile(biking, anna) as p from ids) as x cross join lateral jsonb_array_elements(p -> 'people') with ordinality as e (pe, k)
     order by k $$,
  $$ values (pg_temp.sub('The Man'), 1, '1990-05-01'::text), (pg_temp.sub('The Woman'), 1, null) $$,
  'Couple MF is The Man and The Woman, in order; The Man keeps his birth date'
);
select lives_ok(
  $$ select public.save_profile(biking,
       jsonb_build_object('birth_dates', jsonb_build_array(jsonb_build_object('substatus_id', pg_temp.sub('The Woman'), 'n', 1, 'date', '1992-07-15'))),
       jsonb_build_array(
         pg_temp.answer('headline', '"  Sunday riders  "'),
         pg_temp.answer('about_us', to_jsonb((select body from long_text))),
         pg_temp.answer('ride_days', jsonb_build_array(pg_temp.choice('ride_days', 'Sat'), pg_temp.choice('ride_days', 'Sun'))),
         pg_temp.answer('ride_together', 'false'),
         pg_temp.answer('area', '""'),
         pg_temp.answer('bike_type', to_jsonb(pg_temp.choice('bike_type', 'Gravel')), 'The Man'),
         pg_temp.answer('bike_type', to_jsonb(pg_temp.choice('bike_type', 'Road')), 'The Woman'),
         pg_temp.answer('rides_per_month', '8', 'The Man'),
         pg_temp.answer('rides_per_month', '4.5', 'The Woman'),
         pg_temp.answer('riding_since', '"2015-04-01"', 'The Man'),
         pg_temp.answer('own_bike', 'true', 'The Man'),
         pg_temp.answer('fixture_male_level', '"Elite"', 'The Man')
       )) from ids $$,
  'a couple saves every field type: shared ones in the main section, the rest per person'
);

insert into anna_profile select public.profile(biking, anna) from ids;

select results_eq(
  $$ select f.key, coalesce(sub.label ->> 'en', 'main'), (v ->> 'n')::int, coalesce(v ->> 'text', v ->> 'num', v ->> 'bool', v ->> 'date')
     from anna_profile cross join lateral jsonb_array_elements(p -> 'values') as v
     join public.profile_fields f on f.id = (v ->> 'field_id')::uuid
     left join public.community_options sub on sub.id = (v ->> 'substatus_id')::uuid
     order by f.key collate "C", coalesce(sub.label ->> 'en', 'main') collate "C" $$,
  $$ values
     ('about_us'::text, 'main'::text, 0, (select btrim(body) from long_text)),
     ('fixture_male_level', 'The Man', 1, 'Elite'),
     ('headline', 'main', 0, 'Sunday riders'),
     ('own_bike', 'The Man', 1, 'true'),
     ('ride_together', 'main', 0, 'false'),
     ('rides_per_month', 'The Man', 1, '8'),
     ('rides_per_month', 'The Woman', 1, '4.5'),
     ('riding_since', 'The Man', 1, '2015-04-01') $$,
  'text, number, yes/no and date answers come back in their sections (trimmed; an empty text is no answer)'
);
select results_eq(
  $$ select f.key, coalesce(sub.label ->> 'en', 'main'), array(select jsonb_array_elements_text(c -> 'option_ids'))::uuid[]
     from anna_profile cross join lateral jsonb_array_elements(p -> 'choices') as c
     join public.profile_fields f on f.id = (c ->> 'field_id')::uuid
     left join public.community_options sub on sub.id = (c ->> 'substatus_id')::uuid
     order by f.key collate "C", coalesce(sub.label ->> 'en', 'main') collate "C" $$,
  $$ values
     ('bike_type'::text, 'The Man'::text, array[pg_temp.choice('bike_type', 'Gravel')]),
     ('bike_type', 'The Woman', array[pg_temp.choice('bike_type', 'Road')]),
     ('ride_days', 'main', array[pg_temp.choice('ride_days', 'Sat'), pg_temp.choice('ride_days', 'Sun')]) $$,
  'pick one and pick several answers come back per section, in choice order'
);
select is(
  (select array(select (pe ->> 'birth_date') from jsonb_array_elements(p -> 'people') as pe) from anna_profile),
  array['1990-05-01', '1992-07-15'],
  'each person of the couple has a birth date'
);
select is((select (p ->> 'score')::int from anna_profile), 30, 'score: one long text of 200+ characters (10) + every required field filled (20)');

-- Answers are checked against their fields and sections.
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('about', '"Hi"'))) from ids $$,
  '22023', null, 'a field limited to other Statuses is refused'
);
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('area', '"Solna"', 'The Man'))) from ids $$,
  '22023', null, 'a main-section field is not answered per person'
);
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('bike_type', to_jsonb(pg_temp.choice('bike_type', 'MTB'))))) from ids $$,
  '22023', null, 'a per-person field is not answered in the main section'
);
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('rides_per_month', '3', 'The Man', 2))) from ids $$,
  '22023', null, 'there is no second Man in Couple MF'
);
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('fixture_male_level', '"Pro"', 'The Woman'))) from ids $$,
  '22023', null, 'a field for The Man''s section is refused for The Woman'
);
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('bike_type', to_jsonb(pg_temp.choice('ride_days', 'Mon')), 'The Man'))) from ids $$,
  '22023', null, 'a choice of another field is refused'
);
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('rides_per_month', '"many"', 'The Man'))) from ids $$,
  '22023', null, 'text in a number field is refused'
);
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('own_bike', '"yes"', 'The Man'))) from ids $$,
  '22023', null, 'text in a yes/no field is refused'
);
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('riding_since', '"15 April"', 'The Man'))) from ids $$,
  '22023', null, 'a date must be YYYY-MM-DD'
);
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('headline', to_jsonb(repeat('x', 121))))) from ids $$,
  '22001', null, 'a text longer than the field allows is refused'
);
select throws_ok(
  $$ select public.save_profile(biking, '{}', jsonb_build_array(pg_temp.answer('bike_photo', to_jsonb(gen_random_uuid())))) from ids $$,
  '22023', null, 'a photo answer must be one of your own profile photos'
);

-- The profile image ------------------------------------------------------------------------------
select throws_ok(
  $$ select public.add_profile_photo(biking, pg_temp.photo(erik, '30000000-0000-4000-8000-0000000000f4', true), '{"kind": "profile"}') from ids $$,
  '22023', null, 'a photo must be in your own folder'
);
select throws_ok(
  $$ select public.add_profile_photo(biking, pg_temp.photo(anna, '30000000-0000-4000-8000-0000000000ff', true), '{"kind": "profile"}') from ids $$,
  '22023', null, 'a photo must be uploaded before it is added'
);
select lives_ok(
  $$ select public.add_profile_photo(biking, pg_temp.photo(anna, '30000000-0000-4000-8000-0000000000f1', true), '{"kind": "profile"}') from ids $$,
  'a camera photo becomes the profile image'
);
select results_eq(
  $$ select (p ->> 'score')::int, p -> 'photo' ->> 'taken_in_app', (p -> 'photo' ->> 'taken_at') is not null
     from (select public.profile(biking, anna) as p from ids) as x $$,
  $$ values (70, 'true'::text, true) $$,
  'it is Taken in app with a date, and the score goes up by 40 (image 10 + Taken in app 30)'
);
select is(
  (select public.add_profile_photo(biking, pg_temp.photo(anna, '30000000-0000-4000-8000-0000000000f2', false), '{"kind": "profile"}') -> 'removed' from ids),
  (select jsonb_build_array(pg_temp.photo(anna, '30000000-0000-4000-8000-0000000000f1', true) ->> 'path',
     pg_temp.photo(anna, '30000000-0000-4000-8000-0000000000f1', true) ->> 'thumb_path') from ids),
  'replacing it deletes the old photo and returns its files for Storage cleanup'
);
select results_eq(
  $$ select (p ->> 'score')::int, p -> 'photo' ->> 'taken_in_app', p -> 'photo' -> 'taken_at'
     from (select public.profile(biking, anna) as p from ids) as x $$,
  $$ values (40, 'false'::text, 'null'::jsonb) $$,
  'an uploaded photo is not Taken in app and has no date; the score goes down by 30'
);
select lives_ok(
  $$ select public.add_profile_photo(biking, pg_temp.photo(anna, '30000000-0000-4000-8000-0000000000f3', true),
       jsonb_build_object('kind', 'field', 'field_id', pg_temp.field('bike_photo'))) from ids $$,
  'more photos are photo fields: a camera photo answers one'
);
select is(
  (select v -> 'photo' ->> 'taken_in_app' from (select public.profile(biking, anna) as p from ids) as x, jsonb_array_elements(p -> 'values') as v
   where (v ->> 'field_id')::uuid = pg_temp.field('bike_photo')),
  'true',
  'the photo answer comes back with its photo'
);

-- Storage: uploads go into your own folder only.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) select 'profile', biking || '/' || anna || '/30000000-0000-4000-8000-0000000000aa.webp' from ids $$,
  'a member uploads into their own folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) select 'profile', biking || '/' || erik || '/30000000-0000-4000-8000-0000000000ab.webp' from ids $$,
  '42501', null, 'a member cannot upload into someone else''s folder'
);

-- Linked profiles ----------------------------------------------------------------------------------
select lives_ok($$ select public.set_profile_link(biking, erik, true) from ids $$, 'Anna links to Erik');
select results_eq(
  $$ select l ->> 'username', l -> 'confirmed' from (select public.profile(biking, anna) as p from ids) as x, jsonb_array_elements(p -> 'links') as l $$,
  $$ values ('Erik'::text, 'false'::jsonb) $$,
  'on her own profile the link waits for Erik (unconfirmed)'
);
select throws_ok($$ select public.set_profile_link(biking, bert, true) from ids $$, '22023', null, 'an applicant cannot be linked');
select throws_ok($$ select public.set_profile_link(biking, anna, true) from ids $$, '22023', null, 'you cannot link to yourself');
select lives_ok($$ select public.set_profile_link(biking, carl, true), public.set_profile_link(biking, fred, true) from ids $$, 'Anna links to 2 more (3 in all)');
select throws_ok($$ select public.set_profile_link(biking, gina, true) from ids $$, '23514', null, 'a 4th linked profile is refused');

-- Fred hides from search --------------------------------------------------------------------------
select pg_temp.as_user(fred) from ids;
select lives_ok($$ select public.save_profile(biking, '{"visible_in_search": false}', '[]') from ids $$, 'Fred hides his profile from search');
select is((select p -> 'visible_in_search' from (select public.profile(biking, fred) as p from ids) as x), 'false'::jsonb, 'the toggle is saved');

-- Gina: a District without a Country -----------------------------------------------------------------
select pg_temp.as_user(gina) from ids;
select lives_ok($$ select public.save_profile(biking, '{"place": "Kungsholmen"}', '[]') from ids $$, 'a member with a District but no Country can still save');
select is(
  (select (public.profile(biking, gina) ->> 'country_id')::uuid from ids),
  pg_temp.option('country', 'Sweden'),
  'the Country is filled in from the District'
);

-- Erik ---------------------------------------------------------------------------------------------
select pg_temp.as_user(erik) from ids;
select results_eq(
  $$ select jsonb_array_length(p -> 'links'), p -> 'people' -> 0 -> 'birth_date', jsonb_array_length(p -> 'people'),
       (p -> 'people' -> 1 ->> 'age') is not null, p -> 'created_at', p -> 'own'
     from (select public.profile(biking, anna) as p from ids) as x $$,
  $$ values (0, 'null'::jsonb, 2, true, 'null'::jsonb, 'false'::jsonb) $$,
  'others see no unconfirmed links, no birth dates or account date, but each person''s age'
);
select is(
  (select p -> 'linked_you' -> 0 ->> 'username' from (select public.profile(biking, erik) as p from ids) as x),
  'Anna',
  'Erik sees that Anna linked to him'
);
select lives_ok($$ select public.set_profile_link(biking, anna, true) from ids $$, 'Erik links back to Anna');
select is(
  (select p -> 'links' -> 0 ->> 'username' from (select public.profile(biking, anna) as p from ids) as x),
  'Erik',
  'once both have linked, the link shows on Anna''s profile for others'
);
select throws_ok(
  $$ insert into public.profile_values (community_id, user_id, field_id, value_text)
     select biking, anna, pg_temp.field('headline'), 'Hacked' from ids $$,
  '42501', null, 'another member cannot write Anna''s answers'
);
select throws_ok(
  $$ update public.members set place = 'Hacked' where user_id = (select anna from ids) $$,
  '42501', null, 'another member cannot change Anna''s profile'
);
select is((select public.profile(biking, bert) from ids), null, 'a member cannot see an applicant''s profile');
select lives_ok($$ select public.save_profile(biking, jsonb_build_object('status_id', pg_temp.status('Man')), '[]') from ids $$, 'Erik sets his Status');
select is(
  (select array_agg(c.username order by c.score desc, c.user_id desc) from public.profile_cards((select biking from ids)) as c
   where c.user_id in (select unnest(array[anna, bert, carl, erik, fred, gina]) from ids)),
  array['Anna', 'Gina', 'Erik', 'Carl'],
  'the Profiles list: approved members visible in search, best score first'
);
select is(
  (select ages from public.profile_cards((select biking from ids)) as c where c.user_id = (select anna from ids)),
  (select array(select (pe ->> 'age')::int from jsonb_array_elements(p -> 'people') as pe) from anna_profile),
  'a card has the age of each person'
);
select is(
  (select array_agg(n.username order by n.username) from public.member_names((select biking from ids), 'n') as n
   where n.user_id in (select unnest(array[anna, bert, carl, erik, fred, gina]) from ids) or n.user_id = '00000000-0000-4000-8000-000000000001'),
  array['Anna', 'Gina'],
  'a name search finds approved members, never yourself or the No-reply account'
);

-- Bert, applicant ------------------------------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
select is((select public.profile(biking, anna) from ids), null, 'an applicant cannot see members'' profiles');
select isnt((select public.profile(biking, bert) from ids), null, 'an applicant sees their own profile');
select is_empty($$ select 1 from public.profile_cards((select biking from ids)) $$, 'an applicant gets no Profiles list');
select throws_ok($$ select public.set_profile_link(biking, erik, true) from ids $$, '42501', null, 'an applicant cannot link profiles');

-- Basic fields switched off by the community admin ----------------------------------------------------
select pg_temp.as_user(carl) from ids;
select isnt((select public.profile(biking, bert) from ids), null, 'the community admin sees an applicant''s profile');
select lives_ok(
  $$ select public.save_profile_builtins(biking, '{"show_visibility": false, "show_links": false, "show_age": false, "show_place": false}') from ids $$,
  'the admin switches off "visible in search", linked profiles, age and place'
);
select ok(
  (select bool_or(c.user_id = (select fred from ids)) from public.profile_cards((select biking from ids)) as c),
  'with the visibility choice off, every member is in the Profiles list'
);

select pg_temp.as_user(erik) from ids;
select throws_ok($$ select public.set_profile_link(biking, gina, true) from ids $$, '42501', null, 'with linked profiles off, no new links');
select lives_ok($$ select public.set_profile_link(biking, anna, false) from ids $$, 'removing a link still works');

select pg_temp.as_user(anna) from ids;
select lives_ok(
  $$ select public.save_profile(biking, jsonb_build_object('place', 'Solna', 'birth_dates', jsonb_build_array(
       jsonb_build_object('substatus_id', pg_temp.sub('The Man'), 'n', 1, 'date', '1980-01-01'))), '[]') from ids $$,
  'saving switched-off fields is not an error'
);
select results_eq(
  $$ select p ->> 'place', p -> 'people' -> 0 ->> 'birth_date' from (select public.profile(biking, anna) as p from ids) as x $$,
  $$ values ('Södermalm'::text, '1990-05-01'::text) $$,
  '...but leaves them as they were'
);

-- Dora, admin elsewhere ----------------------------------------------------------------------------------
select pg_temp.as_user(dora) from ids;
select is((select public.profile(biking, anna) from ids), null, 'an admin elsewhere sees no profile here');

select * from finish();
rollback;
