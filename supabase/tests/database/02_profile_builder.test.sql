begin;
create extension if not exists pgtap with schema extensions;

select plan(65);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '20000000-0000-4000-8000-00000000000a'::uuid as anna, -- approved member
  '20000000-0000-4000-8000-00000000000b'::uuid as bert, -- applicant
  '20000000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  '20000000-0000-4000-8000-00000000000d'::uuid as dora; -- admin of another community
grant select on ids to anon, authenticated;

insert into public.communities (slug, name, headline) values ('test-other', 'Other', 'Another community');
insert into public.community_options (community_id, list, label, position)
select id, 'status', '{"en": "Elsewhere"}', 0 from public.communities where slug = 'test-other';

-- Sign-ups give their consents (step 5b); every community's version is 'test' here.
update public.communities set privacy_version = 'test';

insert into auth.users (id, email, raw_user_meta_data)
select anna, 'anna@test.invalid', jsonb_build_object('community_id', biking, 'username', 'Anna', 'consents', '{"privacy": "test", "age_18": true}'::jsonb) from ids
union all
select bert, 'bert@test.invalid', jsonb_build_object('community_id', biking, 'username', 'Bert', 'consents', '{"privacy": "test", "age_18": true}'::jsonb) from ids
union all
select carl, 'carl@test.invalid', jsonb_build_object('community_id', biking, 'username', 'Carl', 'consents', '{"privacy": "test", "age_18": true}'::jsonb) from ids
union all
select dora, 'dora@test.invalid', jsonb_build_object(
  'community_id', (select id from public.communities where slug = 'test-other'), 'username', 'Dora', 'consents', '{"privacy": "test", "age_18": true}'::jsonb) from ids;

update public.members set state = 'approved' where user_id = (select anna from ids);
update public.members set state = 'approved', role = 'admin' where user_id in (select carl from ids union all select dora from ids);

-- Values saved by the admin's RPC calls, read back by later tests.
create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;

-- Shorthands for Biking Stockholm's rows.
create function pg_temp.status(p_label text) returns uuid language sql stable as $$
  select o.id from public.community_options o join ids on o.community_id = ids.biking
  where o.list = 'status' and o.label ->> 'en' = p_label
$$;
create function pg_temp.field(p_key text) returns uuid language sql stable as $$
  select f.id from public.profile_fields f join ids on f.community_id = ids.biking where f.key = p_key
$$;
create function pg_temp.option(p_list text, p_label text) returns uuid language sql stable as $$
  select o.id from public.community_options o join ids on o.community_id = ids.biking
  where o.list = p_list and o.label ->> 'en' = p_label
$$;
grant execute on function pg_temp.status(text), pg_temp.field(text), pg_temp.option(text, text) to anon, authenticated;

-- The profile's order (fields and basic fields) just before the admin moves things.
create temp table field_order (item text, n bigint);
grant all on field_order to authenticated;
-- The profile's order now: a field id, or 'builtin:<name>' for a basic field.
create function pg_temp.layout() returns setof text language sql stable as $$
  select item from (
    select f.id::text as item, f.position, 1 as kind from public.profile_fields f join ids on f.community_id = ids.biking
    union all
    select 'builtin:' || l.builtin, l.position, 0 from public.profile_layout l join ids on l.community_id = ids.biking
  ) as x order by position, kind, item
$$;
grant execute on function pg_temp.layout() to authenticated;

-- Bike type's choices before it is retired.
create temp table bike_choices as
  select id from public.profile_field_options where field_id = pg_temp.field('bike_type');
grant select on bike_choices to authenticated;

-- Seed -----------------------------------------------------------------------------------------
select results_eq(
  $$ select st.label ->> 'en', string_agg((sub.label ->> 'en') || ' x' || s.count, ', ' order by s.position)
     from public.community_options st join ids on st.community_id = ids.biking
     left join public.status_slots s on s.status_id = st.id
     left join public.community_options sub on sub.id = s.substatus_id
     where st.list = 'status' and st.label ->> 'en' in ('Man', 'Woman', 'Other', 'Couple MF', 'Couple MM', 'Couple FF')
     group by st.id, st.label, st.position order by st.position $$,
  $$ values ('Man'::text, 'The Man x1'::text), ('Woman', 'The Woman x1'), ('Other', 'The Other x1'),
     ('Couple MF', 'The Man x1, The Woman x1'), ('Couple MM', 'The Man x2'), ('Couple FF', 'The Woman x2') $$,
  'each Status lists its people as substatuses: one for singles, two for couples'
);
select results_eq(
  $$ select count(*)::int, count(*) filter (where d.active)::int, count(*) filter (where c.label ->> 'en' = 'Sweden')::int
     from public.community_options d join ids on d.community_id = ids.biking
     join public.community_options c on c.id = d.parent_id
     where d.list = 'district' and c.label ->> 'en' not like 'Test %' $$,
  $$ values (21, 21, 21) $$,
  'District list is Sweden''s 21 regions, all in the country Sweden'
);
select results_eq(
  $$ select array(select label ->> 'en' from public.community_options where id = any(f.for_substatuses) order by position)
     from public.profile_fields f where f.id = pg_temp.field('bike_type') $$,
  $$ values (array['The Man', 'The Woman', 'The Other']) $$,
  'Bike type shows in each person''s section (the old "per person")'
);
select results_eq(
  $$ select count(distinct kind)::int from public.profile_fields f join ids on f.community_id = ids.biking $$,
  $$ values (8) $$,
  'the seeded fields use all 8 field types'
);
select results_eq(
  $$ select label ->> 'en' from public.profile_field_options where field_id = pg_temp.field('bike_type') order by position $$,
  $$ values ('Gravel'::text), ('Road'), ('MTB') $$,
  'Bike type has its choices in order'
);
select results_eq(
  $$ select array(select label ->> 'en' from public.community_options where id = any(f.for_statuses) order by position)
     from public.profile_fields f where f.id = pg_temp.field('about_us') $$,
  $$ values (array['Couple MF', 'Couple MM', 'Couple FF']) $$,
  '"About us" is limited to the couple Statuses'
);

-- Constraints ----------------------------------------------------------------------------------
select is(
  (select array_agg(item) from (select item from pg_temp.layout() as item limit 8) as x),
  array['builtin:photo', 'builtin:looking_for', 'builtin:age', 'builtin:country', 'builtin:district', 'builtin:place', 'builtin:score', 'builtin:links'],
  'the basic fields come first by default, then the fields'
);
select is(
  (select count(*)::int from public.profile_layout l join public.communities c on c.id = l.community_id where c.slug = 'test-other'),
  8,
  'a new community gets the basic fields in the default order'
);
select throws_ok(
  $$ insert into public.profile_fields (community_id, key, label, kind, position)
     select biking, 'x', '{"en": "X"}', 'rating', 0 from ids $$,
  '23514', null, 'a field type must be one of the 8 types'
);
select throws_ok(
  $$ insert into public.profile_fields (community_id, key, label, kind, position)
     select biking, 'x', '{"en": " "}', 'short_text', 0 from ids $$,
  '23514', null, 'a label cannot be blank'
);
select throws_ok(
  $$ insert into public.community_options (community_id, list, label, position)
     select biking, 'district', '{"en": "Nowhere"}', 0 from ids $$,
  '23514', null, 'a District belongs to a Country'
);
select throws_ok(
  $$ insert into public.community_options (community_id, list, label, position, parent_id)
     select biking, 'district', '{"en": "Nowhere"}', 0, pg_temp.status('Man') from ids $$,
  '23503', null, 'a District''s parent must be a Country'
);
select throws_ok(
  $$ insert into public.status_slots (community_id, status_id, substatus_id, count, position)
     select biking, pg_temp.status('Other'), pg_temp.option('district', 'Gotland'), 1, 1 from ids $$,
  '23503', null, 'a Status lists Substatuses only'
);
select throws_ok(
  $$ update public.profile_fields set for_substatuses = array[pg_temp.status('Man')] where id = pg_temp.field('area') $$,
  '23503', null, 'a field''s section must be a Substatus'
);
select throws_ok(
  $$ insert into public.profile_field_options (community_id, field_id, label, position)
     select biking, pg_temp.field('headline'), '{"en": "Nope"}', 0 from ids $$,
  '23514', null, 'a short text field cannot have choices'
);
select throws_ok(
  $$ update public.profile_fields set for_statuses = array[
       (select o.id from public.community_options o join ids on o.community_id = ids.biking where list = 'district' limit 1)]
     where id = pg_temp.field('area') $$,
  '23503', null, 'a field can only be limited to Status choices'
);
select throws_ok(
  $$ update public.profile_fields set for_statuses = array[
       (select o.id from public.community_options o join public.communities c on c.id = o.community_id where c.slug = 'test-other')]
     where id = pg_temp.field('area') $$,
  '23503', null, 'a field cannot use another community''s Status'
);

-- Anonymous ------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select 1 from public.profile_fields $$, '42501', null, 'anon cannot read profile fields');
select throws_ok($$ select 1 from public.community_options $$, '42501', null, 'anon cannot read the lists');
reset role;

-- Server cache (service role): reads, never writes ---------------------------------------------
set local role service_role;
select isnt_empty(
  $$ select 1 from public.profile_fields f join public.profile_field_options o on o.field_id = f.id $$,
  'the server cache reads fields and choices'
);
select throws_ok(
  $$ update public.profile_fields set required = true $$,
  '42501', null, 'the server cache cannot change fields'
);
reset role;

-- Bert, applicant ------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', bert, 'role', 'authenticated')::text, true) from ids;
select results_eq(
  $$ select count(*)::int from public.community_options where list = 'status' and label ->> 'en' not like 'Test %' $$,
  $$ values (6) $$,
  'an applicant reads the Status list (to set up their profile)'
);
select isnt_empty($$ select 1 from public.profile_fields $$, 'an applicant reads the profile fields');

-- Dora, admin of another community -------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', dora, 'role', 'authenticated')::text, true) from ids;
select is_empty(
  $$ select 1 from public.profile_fields f join ids on f.community_id = ids.biking $$,
  'an admin elsewhere sees none of this community''s fields'
);
select throws_ok(
  $$ select public.save_profile_field(biking, '{"label": "Hijack", "kind": "short_text"}') from ids $$,
  '42501', null, 'an admin elsewhere cannot add a field here'
);
select throws_ok(
  $$ insert into public.profile_fields (community_id, key, label, kind, position)
     select biking, 'hijack', '{"en": "Hijack"}', 'short_text', 0 from ids $$,
  '42501', null, 'an admin elsewhere cannot insert a field here directly'
);

-- Anna, approved member ------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', anna, 'role', 'authenticated')::text, true) from ids;
select isnt_empty($$ select 1 from public.profile_field_options $$, 'a member reads the field choices');
select throws_ok(
  $$ select public.save_profile_field(biking, '{"label": "Mine", "kind": "short_text"}') from ids $$,
  '42501', null, 'a member cannot add a field'
);
select throws_ok(
  $$ select public.save_community_options(biking, 'status', '[{"label": "Admin"}]') from ids $$,
  '42501', null, 'a member cannot change the Status list'
);
select throws_ok(
  $$ select public.reorder_profile_layout(biking, array[pg_temp.field('area')::text, 'builtin:photo']) from ids $$,
  '42501', null, 'a member cannot reorder the profile'
);
select throws_ok(
  $$ select public.save_profile_builtins(biking, '{"show_score": false}') from ids $$,
  '42501', null, 'a member cannot switch basic fields'
);
select is_empty(
  $$ delete from public.status_slots returning 1 $$,
  'a member''s delete of a Status''s people removes nothing'
);
select throws_ok(
  $$ insert into public.community_options (community_id, list, label, position)
     select biking, 'district', '{"en": "My town"}', 99 from ids $$,
  '42501', null, 'a member cannot insert a District directly'
);
update public.profile_fields set required = true where id = pg_temp.field('headline');
update public.profile_field_options set active = false where field_id = pg_temp.field('bike_type');
select results_eq(
  $$ select (select required from public.profile_fields where id = pg_temp.field('headline')),
            (select bool_and(active) from public.profile_field_options where field_id = pg_temp.field('bike_type')) $$,
  $$ values (false, true) $$,
  'a member''s direct updates change nothing'
);
select throws_ok(
  $$ delete from public.profile_fields where id = pg_temp.field('headline') $$,
  '42501', null, 'a member cannot delete a field'
);

-- Carl, community admin ------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', carl, 'role', 'authenticated')::text, true) from ids;

-- Status list: the whole list in its new order, plus one new choice at the end.
select lives_ok(
  $$ select public.save_community_options(biking, 'substatus', (
       select jsonb_agg(jsonb_build_object('id', id, 'label', label ->> 'en') order by position) || '[{"label": "The Kid"}]'::jsonb
       from public.community_options where community_id = ids.biking and list = 'substatus')) from ids $$,
  'the admin adds a Substatus'
);
select lives_ok(
  $$ select public.save_community_options(biking, 'status', (
       select jsonb_agg(jsonb_build_object('id', id, 'label', label ->> 'en') order by position)
         || jsonb_build_array(jsonb_build_object('label', 'Family', 'slots', jsonb_build_array(
              jsonb_build_object('substatus_id', pg_temp.option('substatus', 'The Woman'), 'count', 2),
              jsonb_build_object('substatus_id', pg_temp.option('substatus', 'The Kid'), 'count', 3))))
       from public.community_options where community_id = ids.biking and list = 'status')) from ids $$,
  'the admin adds a Status with its people: 2 adults and 3 kids'
);
select results_eq(
  $$ select st.position = (select max(position) from public.community_options o join ids on o.community_id = ids.biking where list = 'status'),
       (select string_agg((sub.label ->> 'en') || ' x' || s.count, ', ' order by s.position)
        from public.status_slots s join public.community_options sub on sub.id = s.substatus_id where s.status_id = st.id),
       (select count(*)::int from public.status_slots s where s.status_id = pg_temp.status('Couple MF'))
     from public.community_options st join ids on st.community_id = ids.biking
     where st.list = 'status' and st.label ->> 'en' = 'Family' $$,
  $$ values (true, 'The Woman x2, The Kid x3'::text, 2) $$,
  'the new Status is saved last with its people; Statuses saved without people keep theirs'
);
select throws_ok(
  $$ select public.save_community_options(biking, 'status', jsonb_build_array(jsonb_build_object('label', 'Odd', 'slots',
       jsonb_build_array(jsonb_build_object('substatus_id', pg_temp.status('Man')))))) from ids $$,
  '23503', null, 'a Status''s people must be Substatuses'
);
select throws_ok(
  $$ select public.save_community_options(biking, 'district', '[{"label": "Gotland"}, {"label": "gotland "}]', pg_temp.option('country', 'Sweden')) from ids $$,
  '23505', null, 'two choices in a list cannot have the same name'
);
select throws_ok(
  $$ select public.save_community_options(biking, 'district', '[{"label": "Oslo"}]') from ids $$,
  '22023', null, 'districts are saved for one country'
);
select lives_ok(
  $$ select public.save_community_options(biking, 'country', (
       select jsonb_agg(jsonb_build_object('id', id, 'label', label ->> 'en')) || '[{"label": "Norway"}]'::jsonb
       from public.community_options where community_id = ids.biking and list = 'country')) from ids $$,
  'the admin adds a Country'
);
select lives_ok(
  $$ select public.save_community_options(biking, 'district', '[{"label": "Oslo"}]', pg_temp.option('country', 'Norway')) from ids $$,
  'the admin adds a District to it'
);
select results_eq(
  $$ select c.label ->> 'en', count(*)::int from public.community_options d join ids on d.community_id = ids.biking
     join public.community_options c on c.id = d.parent_id where d.list = 'district' and c.label ->> 'en' not like 'Test %'
     group by c.label ->> 'en' order by 1 $$,
  $$ values ('Norway'::text, 1), ('Sweden', 21) $$,
  'each country keeps its own districts'
);
select lives_ok(
  $$ select public.save_profile_builtins(biking, '{"show_score": false, "show_links": false}') from ids $$,
  'the admin switches basic fields off'
);
select results_eq(
  $$ select show_score, show_links, show_age from public.communities join ids on id = biking $$,
  $$ values (false, false, true) $$,
  'only the switches sent change'
);
select throws_ok(
  $$ select public.save_profile_builtins(biking, '{"show_status": false}') from ids $$,
  '22023', null, 'Status cannot be switched off'
);

-- A pick one field, limited to Couple MF.
insert into saved
select 'route', public.save_profile_field(
  biking,
  jsonb_build_object('label', 'Favourite route', 'kind', 'pick_one', 'searchable', true,
    'for_statuses', jsonb_build_array(pg_temp.status('Couple MF'))),
  '[{"label": "Slussen loop"}, {"label": "Lidingö"}]')
from ids;
select results_eq(
  $$ select key ~ '^favourite_route(_\d+)?$', kind, searchable, for_statuses = array[pg_temp.status('Couple MF')],
       position > (select max(position) from public.profile_layout l join ids on l.community_id = ids.biking)
       and position = (select max(position) from public.profile_fields f join ids on f.community_id = ids.biking)
     from public.profile_fields where id = (select id from saved where name = 'route') $$,
  $$ values (true, 'pick_one'::text, true, true, true) $$,
  'the admin adds a pick one field for Couple MF only, placed last'
);
select results_eq(
  $$ select label ->> 'en' from public.profile_field_options where field_id = (select id from saved where name = 'route') order by position $$,
  $$ values ('Slussen loop'::text), ('Lidingö') $$,
  'its choices are saved in order'
);
select lives_ok(
  $$ select public.save_profile_field(biking, jsonb_build_object('label', 'Male competition level', 'kind', 'short_text',
       'for_substatuses', jsonb_build_array(pg_temp.option('substatus', 'The Man')))) from ids $$,
  'the admin adds a field shown only in The Man''s section'
);
select is(
  (select for_substatuses from public.profile_fields f join ids on f.community_id = ids.biking where f.key ~ '^male_competition_level'
   order by f.created_at desc limit 1),
  array[pg_temp.option('substatus', 'The Man')],
  'its section is saved'
);
insert into saved
select 'route2', public.save_profile_field(biking, '{"label": "Favourite route", "kind": "short_text"}') from ids;
select results_eq(
  $$ select r2.key ~ '^favourite_route_\d+$', r2.key <> r1.key
     from public.profile_fields r1, public.profile_fields r2
     where r1.id = (select id from saved where name = 'route') and r2.id = (select id from saved where name = 'route2') $$,
  $$ values (true, true) $$,
  'a second field with the same name gets its own key'
);
select throws_ok(
  $$ select public.save_profile_field(biking, '{"label": "Empty pick", "kind": "pick_several"}') from ids $$,
  '23514', null, 'a pick field needs at least one choice'
);
select throws_ok(
  $$ select public.save_profile_field(biking, '{"label": "Count", "kind": "number"}', '[{"label": "One"}]') from ids $$,
  '23514', null, 'a number field cannot have choices'
);
select throws_ok(
  $$ update public.profile_fields set kind = 'number' where id = pg_temp.field('bike_type') $$,
  '42501', null, 'a field''s type can never change (answers would no longer fit)'
);

-- Retire, never delete: answers keep pointing at the same field and choices.
select throws_ok(
  $$ delete from public.profile_fields where id = pg_temp.field('bike_type') $$,
  '42501', null, 'not even the admin can delete a field'
);
select throws_ok(
  $$ delete from public.profile_field_options where field_id = pg_temp.field('bike_type') $$,
  '42501', null, 'not even the admin can delete a choice'
);
select lives_ok(
  $$ select public.save_profile_field(biking,
       jsonb_build_object('id', pg_temp.field('bike_type'), 'label', 'Bike type', 'active', false),
       (select jsonb_agg(jsonb_build_object('id', id, 'label', label ->> 'en') order by position)
        from public.profile_field_options where field_id = pg_temp.field('bike_type'))) from ids $$,
  'the admin retires a field'
);
select results_eq(
  $$ select active, kind, key from public.profile_fields where id = pg_temp.field('bike_type') $$,
  $$ values (false, 'pick_one'::text, 'bike_type'::text) $$,
  'a retired field keeps its id, type and key'
);
select set_eq(
  $$ select id from public.profile_field_options where field_id = pg_temp.field('bike_type') $$,
  $$ select id from bike_choices $$,
  'a retired field keeps all its choices, so old answers still resolve'
);
select lives_ok(
  $$ select public.save_profile_field(biking,
       jsonb_build_object('id', (select id from saved where name = 'route'), 'label', 'Favourite route'),
       (select jsonb_agg(jsonb_build_object('id', id, 'label', label ->> 'en', 'active', position = 0) order by position)
        from public.profile_field_options where field_id = (select id from saved where name = 'route'))) from ids $$,
  'the admin retires one choice'
);
select results_eq(
  $$ select label ->> 'en', active from public.profile_field_options
     where field_id = (select id from saved where name = 'route') order by position $$,
  $$ values ('Slussen loop'::text, true), ('Lidingö', false) $$,
  'a retired choice stays, inactive'
);

-- Order and isolation.
insert into field_order select item, row_number() over () from pg_temp.layout() as item;
select lives_ok(
  $$ select public.reorder_profile_layout(biking,
       array[pg_temp.field('area')::text, 'builtin:photo']
       || array(select item from field_order where item not in (pg_temp.field('area')::text, 'builtin:photo', 'builtin:score') order by n)
       || array['builtin:score']) from ids $$,
  'the admin moves Area and the profile image to the top, and the score to the end'
);
select results_eq(
  $$ select item from pg_temp.layout() as item $$,
  $$ select pg_temp.field('area')::text union all select 'builtin:photo'
     union all (select item from field_order where item not in (pg_temp.field('area')::text, 'builtin:photo', 'builtin:score') order by n)
     union all select 'builtin:score' $$,
  'the new order is saved: fields and basic fields in one list'
);
select throws_ok(
  $$ select public.save_community_options(c.id, 'status', '[{"label": "Takeover"}]') from public.communities c where c.slug = 'test-other' $$,
  '42501', null, 'the admin cannot change another community''s lists'
);

select * from finish();
rollback;
