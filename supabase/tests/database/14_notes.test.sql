begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Step 10: the notes screens (profile ⭐, DM ⭐) read the notes table directly under RLS and write it
-- with set_note (table and function from 20261025120000_search.sql, step 9).

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm') as biking,
  'e0000000-0000-4000-8000-00000000000a'::uuid as anna, -- writes the notes
  'e0000000-0000-4000-8000-00000000000b'::uuid as bert, -- the note is about him
  'e0000000-0000-4000-8000-00000000000c'::uuid as carl, -- community admin
  'e0000000-0000-4000-8000-00000000000d'::uuid as dora; -- another member
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
insert into auth.users (id, email, raw_user_meta_data)
select u.id, u.name || '@test.invalid',
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.anna, 'anna'), (ids.bert, 'bert'), (ids.carl, 'carl'), (ids.dora, 'dora')) as u (id, name);
update public.members set state = 'approved' where user_id in (select unnest(array[anna, bert, carl, dora]) from ids);
update public.members set role = 'admin' where user_id = (select carl from ids);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
-- What the notes screen reads (features/notes/queries.ts): one row by the primary key.
create function pg_temp.note(p_author uuid, p_subject uuid) returns table (body text, stars smallint) language sql as $$
  select n.body, n.stars from public.notes n
  where n.community_id = (select biking from ids) and n.author_id = p_author and n.subject_id = p_subject
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.note(uuid, uuid) to anon, authenticated;

-- Anonymous ------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select 1 from public.notes $$, '42501', null, 'anon cannot read notes');
reset role;

-- Anna writes about Bert -----------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select is_empty($$ select * from pg_temp.note((select anna from ids), (select bert from ids)) $$, 'no note yet: the screen starts empty');
select lives_ok($$ select public.set_note(biking, bert, '{"body": "Test rides on Sundays", "stars": null}') from ids $$, 'a note with text and no stars');
select results_eq($$ select * from pg_temp.note((select anna from ids), (select bert from ids)) $$, $$ values ('Test rides on Sundays'::text, null::smallint) $$, 'the screen reads it back');
select lives_ok($$ select public.set_note(biking, bert, '{"body": "Test rides on Sundays", "stars": 5}') from ids $$, 'saving the screen with 5 stars');
select results_eq($$ select * from pg_temp.note((select anna from ids), (select bert from ids)) $$, $$ values ('Test rides on Sundays'::text, 5::smallint) $$, 'text and stars together');
select is((select stars from public.search_profiles((select biking from ids)) where user_id = (select bert from ids)), 5::smallint,
  'the stars from the screen are the ones the Profiles list and swipe show');
select throws_ok($$ select public.set_note(biking, bert, jsonb_build_object('body', repeat('x', 32001))) from ids $$, '23514', null, 'a note is at most 32,000 characters');
select throws_ok($$ select public.set_note(biking, bert, '{"body": 3}') from ids $$, '22023', null, 'a note''s text is a string');
select throws_ok($$ update public.notes set body = 'Hacked' where author_id = (select anna from ids) $$, '42501', null, 'notes can''t be changed directly');

-- Nobody else reads it ------------------------------------------------------------------------
select pg_temp.as_user(bert) from ids;
select is_empty($$ select * from pg_temp.note((select anna from ids), (select bert from ids)) $$, 'the member it is about can''t read it');
select pg_temp.as_user(carl) from ids;
select is_empty($$ select * from pg_temp.note((select anna from ids), (select bert from ids)) $$, 'nor the community admin');
select pg_temp.as_user(dora) from ids;
select is((select count(*)::int from public.notes), 0, 'another member reads no notes at all');

-- Emptying the screen, and a member leaving ----------------------------------------------------
select pg_temp.as_user(anna) from ids;
select lives_ok($$ select public.set_note(biking, bert, '{"body": "", "stars": null}') from ids $$, 'clearing the text and the stars');
select is_empty($$ select * from pg_temp.note((select anna from ids), (select bert from ids)) $$, 'deletes the note');
select public.set_note(biking, dora, '{"stars": 2}') from ids;
reset role;
delete from public.members where user_id = (select dora from ids);
select is((select count(*)::int from public.notes where subject_id = (select dora from ids)), 0, 'notes about a member who is deleted go with them');

select * from finish();
rollback;
