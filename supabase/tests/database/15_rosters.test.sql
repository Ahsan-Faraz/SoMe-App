begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- Step 11: member lists (paged, searched in the database), statistics and the group "+" list.

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'f0000000-0000-4000-8000-00000000000a'::uuid as anna, -- member, community record with real names
  'f0000000-0000-4000-8000-00000000000b'::uuid as bert, -- member
  'f0000000-0000-4000-8000-00000000000c'::uuid as carl, -- member, blocked the group admin
  'f0000000-0000-4000-8000-00000000000d'::uuid as dora, -- applicant to the community
  'f0000000-0000-4000-8000-00000000000e'::uuid as erik, -- community admin
  'f0000000-0000-4000-8000-00000000000f'::uuid as fred, -- in the group
  'f0000000-0000-4000-8000-000000000010'::uuid as gina, -- the group's admin
  'f0000000-0000-4000-8000-000000000011'::uuid as hugo, -- applies to the group
  'f0000000-0000-4000-8000-0000000000a1'::uuid as grp, -- Gina's group
  'f0000000-0000-4000-8000-0000000000a2'::uuid as other; -- a group Gina doesn't run
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test r11 ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values
  (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dora, 'dora'), (ids.erik, 'erik'), (ids.fred, 'fred'), (ids.gina, 'gina'), (ids.hugo, 'hugo')
) as u (id, name);

create function pg_temp.status(p_label text) returns uuid language sql stable as $$
  select o.id from public.community_options o join ids on o.community_id = ids.biking where o.list = 'status' and o.label ->> 'en' = p_label
$$;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
-- Names on one page of a list, without the "Test r11 " prefix.
create function pg_temp.names(p_chat uuid, p_query text, p_after text default null, p_limit integer default 50) returns text[] language sql as $$
  select coalesce(array_agg(replace(r.username, 'Test r11 ', '') order by lower(r.username)), '{}')
  from public.roster_members((select biking from ids), p_chat, p_query, p_after, p_limit) as r
$$;
grant execute on function pg_temp.status(text), pg_temp.as_user(uuid), pg_temp.names(uuid, text, text, integer) to anon, authenticated;

update public.members m set state = 'approved', status_id = pg_temp.status(s.status)
from (values ('anna', 'Woman'), ('bert', 'Man'), ('carl', 'Man'), ('erik', 'Man'), ('fred', 'Man'), ('gina', 'Woman'), ('hugo', 'Man')) as s (name, status)
where m.username = 'Test r11 ' || s.name;
update public.members set role = 'admin' where user_id = (select erik from ids);
insert into public.blocks (community_id, blocker_id, blocked_id) select biking, carl, gina from ids;

-- Dora applies to the community, Hugo to Gina's group.
insert into public.applications (community_id, user_id, message, real_name_1) select biking, dora, 'Test let me in', 'Test Dora Real' from ids;
update public.members set state = 'applied' where user_id = (select dora from ids);
insert into public.chats (id, community_id, kind, name, created_by)
select g.id, ids.biking, 'group', g.name, ids.gina from ids cross join lateral (values (ids.grp, 'Test r11 Riders'), (ids.other, 'Test r11 Other')) as g (id, name);
insert into public.chat_members (chat_id, community_id, user_id, role)
select ids.grp, ids.biking, m.id, m.role from ids cross join lateral (values (ids.gina, 'admin'), (ids.fred, 'member'), (ids.anna, 'member')) as m (id, role);
insert into public.chat_members (chat_id, community_id, user_id, role) select other, biking, erik, 'admin' from ids;
insert into public.applications (community_id, user_id, chat_id, message) select biking, hugo, grp, 'Test can I ride' from ids;

-- Admin records: the community's and the group's are kept apart (D24).
insert into public.admin_records (scope_id, community_id, user_id, real_name_1, state_1, state_2)
select biking, biking, anna, 'Test Annika Lind', 10, 20 from ids
union all select biking, biking, bert, null, 5, null from ids
union all select grp, biking, fred, 'Test Fredrik', 7, null from ids
union all select grp, biking, anna, null, 1, 2 from ids;

-- Anonymous ------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.roster_members((select biking from ids)) $$, '42501', null, 'anon cannot list members');
select throws_ok($$ select public.scope_stats((select biking from ids)) $$, '42501', null, 'anon cannot read statistics');
reset role;

-- Community admin ------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(erik) from ids;
select is(pg_temp.names(null, 'test r11'), array['anna', 'bert', 'carl', 'erik', 'fred', 'gina', 'hugo'], 'A31: approved members by name; not the applicant');
select is(pg_temp.names(null, 'test r11', null, 3), array['anna', 'bert', 'carl'], 'the first page');
select is(pg_temp.names(null, 'test r11', 'Test r11 Carl', 3), array['erik', 'fred', 'gina'], 'the next page starts after the last name');
select is(pg_temp.names(null, 'annika'), array['anna'], 'the search finds a real name from the community record');
select is(pg_temp.names(null, 'fredrik'), '{}'::text[], 'but not a group''s real names');
select is(
  (select array[state_1, state_2] from public.roster_members((select biking from ids), null, 'test r11 anna')),
  array[10, 20], 'a row has the community record''s numbers'
);
select is(
  (select array_agg(replace(a.username, 'Test r11 ', '') || ': ' || a.real_name_1) from public.roster_applications((select biking from ids), null, 'test r11') as a),
  array['dora: Test Dora Real'], 'A20: the open community applications, with the names sent'
);
select is(
  (select count(*)::int from public.roster_applications((select biking from ids), null, 'test r11',
     (select created_at from public.applications where user_id = (select dora from ids)), (select id from public.applications where user_id = (select dora from ids)))),
  0, 'the next page of applications starts after the last one'
);
-- A31 edit, then a reload of the list.
select lives_ok($$ select public.save_admin_record(biking, bert, '{"state_1": 42, "notes": "Test paid at the door"}') from ids $$, 'an edit in the list saves');
select is((select state_1 || ' ' || notes from public.roster_members((select biking from ids), null, 'test r11 bert')), '42 Test paid at the door', 'and is there after a reload');

-- A33 statistics match the whole community.
select is(
  (select (public.scope_stats(biking) ->> 'members')::int from ids),
  (select count(*)::int from public.members m join ids on m.community_id = ids.biking where m.state = 'approved' and not m.is_system),
  'A33: the member count is every approved member'
);
select is(
  (select public.scope_stats(biking) -> 'sums' from ids),
  (select jsonb_build_array(coalesce(sum(r.state_1), 0), coalesce(sum(r.state_2), 0), coalesce(sum(r.state_3), 0))
   from public.admin_records r join ids on r.scope_id = ids.biking
   join public.members m on m.community_id = r.community_id and m.user_id = r.user_id and m.state = 'approved' and not m.is_system),
  'the sums are the community records of the members'
);

-- Group admin ----------------------------------------------------------------------------------
select pg_temp.as_user(gina) from ids;
select is(pg_temp.names((select grp from ids), null), array['anna', 'fred', 'gina'], 'A30: the group admin lists her group');
select is(pg_temp.names((select grp from ids), 'fredrik'), array['fred'], 'the search finds the group''s real names');
select is(
  (select array[state_1, state_2] from public.roster_members((select biking from ids), (select grp from ids), 'test r11 anna')),
  array[1, 2], 'a group row has the group''s record, not the community''s'
);
select is(
  (select array_agg(replace(a.username, 'Test r11 ', '')) from public.roster_applications((select biking from ids), (select grp from ids)) as a),
  array['hugo'], 'A23: the group''s open applications'
);
select is(
  (select public.scope_stats(biking, grp) from ids),
  jsonb_build_object('members', 3,
    'by_status', jsonb_build_array(jsonb_build_object('status_id', pg_temp.status('Woman'), 'count', 2), jsonb_build_object('status_id', pg_temp.status('Man'), 'count', 1)),
    'sums', jsonb_build_array(8, 2, 0)),
  'A28: count, per Status and the sums of the group''s records'
);
select is(pg_temp.names((select other from ids), null), '{}'::text[], 'a group admin sees only her own groups');
select is((select public.scope_stats(biking, other) from ids), null, 'nor their statistics');
select throws_ok($$ select * from public.roster_members((select biking from ids)) $$, '42501', null, 'nor the community''s members');
select is(
  (select array_agg(replace(c.username, 'Test r11 ', '') order by lower(c.username)) from public.group_candidates((select biking from ids), (select grp from ids), 'test r11') as c),
  array['bert', 'erik', 'hugo'], '"+": approved members not in the group; not someone in a block with you'
);
select is((select count(*)::int from public.group_candidates((select biking from ids), (select grp from ids), 'test r11 hu')), 1, '"+" searches by name');

-- A member who runs nothing ------------------------------------------------------------------------
select pg_temp.as_user(fred) from ids;
select is(pg_temp.names((select grp from ids), null), '{}'::text[], 'a member gets no member list');
select is(
  (select count(*)::int from public.roster_applications((select biking from ids), (select grp from ids))), 0, 'nor applications');
select is((select public.scope_stats(biking, grp) from ids), null, 'nor statistics');
select is((select count(*)::int from public.group_candidates((select biking from ids), (select grp from ids))), 0, 'nor the "+" list');

select * from finish();
rollback;
