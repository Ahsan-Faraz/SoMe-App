begin;
create extension if not exists pgtap with schema extensions;

select plan(46);

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

insert into auth.users (id, email, raw_user_meta_data)
select anna, 'anna@test.invalid', jsonb_build_object('community_id', biking, 'username', 'Anna') from ids
union all
select bert, 'bert@test.invalid', jsonb_build_object('community_id', biking, 'username', 'Bert') from ids
union all
select carl, 'carl@test.invalid', jsonb_build_object('community_id', biking, 'username', 'Carl') from ids
union all
select dora, 'dora@test.invalid', jsonb_build_object(
  'community_id', (select id from public.communities where slug = 'test-other'), 'username', 'Dora') from ids;

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
grant execute on function pg_temp.status(text), pg_temp.field(text) to anon, authenticated;

-- Bike type's choices before it is retired.
create temp table bike_choices as
  select id from public.profile_field_options where field_id = pg_temp.field('bike_type');
grant select on bike_choices to authenticated;

-- Seed -----------------------------------------------------------------------------------------
select results_eq(
  $$ select label ->> 'en', people::int from public.community_options o join ids on o.community_id = ids.biking
     where list = 'status' order by position $$,
  $$ values ('Man'::text, 1), ('Woman', 1), ('Other', 1), ('Couple MF', 2), ('Couple MM', 2), ('Couple FF', 2) $$,
  'Status list is seeded in order; couples are 2 people'
);
select results_eq(
  $$ select count(*)::int, count(*) filter (where active)::int from public.community_options o join ids on o.community_id = ids.biking
     where list = 'district' $$,
  $$ values (21, 21) $$,
  'District list is Sweden''s 21 regions'
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
  $$ insert into public.community_options (community_id, list, label, people, position)
     select biking, 'district', '{"en": "Twin town"}', 2, 0 from ids $$,
  '23514', null, 'only a Status can be 2 people'
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
  $$ select count(*)::int from public.community_options where list = 'status' $$,
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
  $$ select public.reorder_profile_fields(biking, array[pg_temp.field('area')]) from ids $$,
  '42501', null, 'a member cannot reorder fields'
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
  $$ select public.save_community_options(biking, 'status', (
       select jsonb_agg(jsonb_build_object('id', id, 'label', label ->> 'en', 'people', people) order by position)
         || '[{"label": "Group", "people": 2}]'::jsonb
       from public.community_options where community_id = ids.biking and list = 'status')) from ids $$,
  'the admin adds a Status'
);
select results_eq(
  $$ select label ->> 'en', people, position from public.community_options o join ids on o.community_id = ids.biking
     where list = 'status' and label ->> 'en' = 'Group' $$,
  $$ values ('Group'::text, 2::smallint, 6::smallint) $$,
  'the new Status is saved last, as 2 people'
);
select throws_ok(
  $$ select public.save_community_options(biking, 'district', '[{"label": "Gotland"}, {"label": "gotland "}]') from ids $$,
  '23505', null, 'two choices in a list cannot have the same name'
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
  $$ select key, kind, searchable, for_statuses = array[pg_temp.status('Couple MF')], position
     from public.profile_fields where id = (select id from saved where name = 'route') $$,
  $$ values ('favourite_route'::text, 'pick_one'::text, true, true, 12::smallint) $$,
  'the admin adds a pick one field for Couple MF only, placed last'
);
select results_eq(
  $$ select label ->> 'en' from public.profile_field_options where field_id = (select id from saved where name = 'route') order by position $$,
  $$ values ('Slussen loop'::text), ('Lidingö') $$,
  'its choices are saved in order'
);
insert into saved
select 'route2', public.save_profile_field(biking, '{"label": "Favourite route", "kind": "short_text"}') from ids;
select is(
  (select key from public.profile_fields where id = (select id from saved where name = 'route2')),
  'favourite_route_2',
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
select lives_ok(
  $$ select public.reorder_profile_fields(biking, array(
       select id from public.profile_fields where community_id = ids.biking order by key = 'area' desc, position)) from ids $$,
  'the admin moves Area to the top'
);
select results_eq(
  $$ select key from public.profile_fields f join ids on f.community_id = ids.biking order by position limit 3 $$,
  $$ values ('area'::text), ('headline'), ('about') $$,
  'the new order is saved'
);
select throws_ok(
  $$ select public.save_community_options(c.id, 'status', '[{"label": "Takeover"}]') from public.communities c where c.slug = 'test-other' $$,
  '42501', null, 'the admin cannot change another community''s lists'
);

select * from finish();
rollback;
