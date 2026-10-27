-- Step 5b speed check: sign-up with consents, applying with an ID photo, the admin view and the
-- decision that deletes the images, on 5,000 seeded members with 5,000 consents each kind. Rolled back.
-- Run: npx supabase db query --linked -f scripts/speed/07_real_members.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking;
grant select on seed to authenticated;

update public.communities set require_age_18 = true, require_identity = true where id = (select biking from seed);

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('72000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- 5,000 sign-ups through the trigger (member + 2 consents each), timed as one batch.
create temp table t0 as select clock_timestamp() as at;
insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed5b' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed5b ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 5000) as n;
insert into speed select 'sign-up trigger, per member (5,000 in one batch)', round(extract(epoch from clock_timestamp() - at) * 1000 / 5000, 3), 5 from t0;

update public.members set state = 'approved', role = 'admin' where user_id = pg_temp.u(1);

-- 1,000 open applications, each with an image and an ID photo (rows only: no files are needed here).
insert into public.photos (id, community_id, owner_id, bucket, path, thumb_path, width, height, purpose)
select ('73000000-0000-4000-8000-' || lpad((n * 2 + k)::text, 12, '0'))::uuid, seed.biking, pg_temp.u(n), 'private',
  seed.biking || '/' || pg_temp.u(n) || '/' || n || '-' || k || '.webp', seed.biking || '/' || pg_temp.u(n) || '/' || n || '-' || k || '_t.webp',
  1600, 1200, case when k = 0 then 'application' else 'identity' end
from seed, generate_series(2, 1001) as n, generate_series(0, 1) as k;
insert into public.applications (community_id, user_id, photo_id, id_photo_id, message)
select seed.biking, pg_temp.u(n), ('73000000-0000-4000-8000-' || lpad((n * 2)::text, 12, '0'))::uuid,
  ('73000000-0000-4000-8000-' || lpad((n * 2 + 1)::text, 12, '0'))::uuid, 'Test application'
from seed, generate_series(2, 1001) as n;
update public.members set state = 'applied' where user_id in (select pg_temp.u(n) from generate_series(2, 1001) as n);
analyze public.members, public.member_consents, public.applications, public.photos;

create function pg_temp.time(p_name text, p_sql text, p_target numeric, p_runs integer default 5) returns void language plpgsql as $$
declare
  v_plan json;
  v_best numeric;
  v_ms numeric;
begin
  for i in 1..p_runs loop
    execute 'explain (analyze, format json) ' || replace(p_sql, '$i', i::text) into v_plan;
    v_ms := (v_plan -> 0 ->> 'Execution Time')::numeric;
    v_best := least(coalesce(v_best, v_ms), v_ms);
  end loop;
  insert into pg_temp.speed values (p_name, round(v_best, 2), p_target);
end
$$;
grant execute on function pg_temp.time(text, text, numeric, integer), pg_temp.u(integer) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
select pg_temp.time('admin_member (A21, with ID photo)', format('select public.admin_member(%L, %L)', (select biking from seed), pg_temp.u(500)), 15);
-- Each run decides a different application (approve: rows deleted, files returned).
select pg_temp.time('decide_application (approve + delete images)',
  format('select public.decide_application((select id from public.applications where user_id = pg_temp.u(600 + $i)), %L)', 'approved'), 15);
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(900), 'role', 'authenticated')::text, true);
select pg_temp.time('my_application (with ID photo)', format('select public.my_application(%L)', (select biking from seed)), 15);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result,
  (select count(*) from public.member_consents where user_id::text like '72000000-%') as seeded_consents
from speed;
rollback;
