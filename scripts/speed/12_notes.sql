-- Step 10 speed check: the notes screen's read and save, rolled back at the end. 5,000 members and
-- 100,000 notes (20 per member), the viewer the author of 2,000 of them. Timed as the viewer (best
-- of 5); the read goes through RLS like the screen's (features/notes/queries.ts).
-- Run: npx supabase db query --linked -f scripts/speed/12_notes.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking;
grant select on seed to authenticated;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('76000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed10-' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed10 ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 5000) as n;
update public.members set state = 'approved' where user_id::text like '76000000-%';

-- Every member writes 20 notes; the viewer (1) 2,000.
insert into public.notes (community_id, author_id, subject_id, body, stars)
select seed.biking, pg_temp.u(a), pg_temp.u(1 + (a + k * 37) % 5000), 'Test note ' || k, 1 + k % 5
from seed, generate_series(2, 5000) as a, generate_series(1, 20) as k
where 1 + (a + k * 37) % 5000 <> a
on conflict do nothing;
insert into public.notes (community_id, author_id, subject_id, body, stars)
select seed.biking, pg_temp.u(1), pg_temp.u(n), repeat('Test long note. ', 200), 1 + n % 5 from seed, generate_series(2, 2001) as n;
analyze public.notes;

create function pg_temp.time(p_name text, p_sql text, p_target numeric) returns void language plpgsql as $$
declare
  v_plan json;
  v_best numeric;
  v_ms numeric;
begin
  for i in 1..5 loop
    execute 'explain (analyze, format json) ' || p_sql into v_plan;
    v_ms := (v_plan -> 0 ->> 'Execution Time')::numeric;
    v_best := least(coalesce(v_best, v_ms), v_ms);
  end loop;
  insert into pg_temp.speed values (p_name, round(v_best, 2), p_target);
end
$$;
grant execute on function pg_temp.time(text, text, numeric), pg_temp.u(integer) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);

select pg_temp.time('notes screen: read my note (RLS)', format(
  'select body, stars, updated_at from public.notes where community_id = %L and author_id = %L and subject_id = %L',
  (select biking from seed), pg_temp.u(1), pg_temp.u(1500)), 15);
select pg_temp.time('notes screen: read, no note yet', format(
  'select body, stars, updated_at from public.notes where community_id = %L and author_id = %L and subject_id = %L',
  (select biking from seed), pg_temp.u(1), pg_temp.u(4500)), 15);
select pg_temp.time('set_note: text and stars', format('select public.set_note(%L, %L, %L)', (select biking from seed), pg_temp.u(1500),
  jsonb_build_object('body', repeat('Test changed note. ', 200), 'stars', 4)), 15);
select pg_temp.time('set_note: a new note', format('select public.set_note(%L, %L, %L)', (select biking from seed), pg_temp.u(4500), '{"body": "Test new", "stars": 3}'), 15);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result,
  (select count(*) from public.notes where author_id::text like '76000000-%') as seeded_notes
from speed;
rollback;
