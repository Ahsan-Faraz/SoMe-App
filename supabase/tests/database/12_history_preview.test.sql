begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  '91000000-0000-4000-8000-00000000000a'::uuid as carl, -- community admin, runs the groups
  '91000000-0000-4000-8000-00000000000b'::uuid as dina; -- member: added after the first post
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.carl, 'carl'), (ids.dina, 'dina')) as u (id, name);
update public.members set state = 'approved' where user_id in (select unnest(array[carl, dina]) from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(uuid) to anon, authenticated;

create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;

-- A group with history off and one with history on, each with a post before Dina joins ------------
set local role authenticated;
select pg_temp.as_user(carl) from ids;
insert into saved select 'closed', public.save_group(biking, null, '{"name": "Test Closed", "history": false}') from ids;
insert into saved select 'open', public.save_group(biking, null, '{"name": "Test Open", "history": true}') from ids;
select public.send_message(biking, s.id, 'Test before Dina') from ids, saved s;
select public.set_group_member(biking, s.id, dina, true) from ids, saved s;

select pg_temp.as_user(dina) from ids;
select is(
  (select preview from public.chat_list((select biking from ids)) where name = 'Test Closed'), null,
  'history off: the group shows without the post from before she joined'
);
select is(
  (select preview from public.chat_list((select biking from ids)) where name = 'Test Open'), 'Test carl: Test before Dina',
  'history on: she sees the last post as the preview'
);
select is(
  (select unread from public.chat_list((select biking from ids)) where name = 'Test Closed'), 0::bigint,
  'and nothing in the closed group counts as unread'
);

select pg_temp.as_user(carl) from ids;
select public.send_message(biking, (select id from saved where name = 'closed'), 'Test after Dina') from ids;
select pg_temp.as_user(dina) from ids;
select is(
  (select preview from public.chat_list((select biking from ids)) where name = 'Test Closed'), 'Test carl: Test after Dina',
  'a post after she joined is her preview'
);

select * from finish();
rollback;
