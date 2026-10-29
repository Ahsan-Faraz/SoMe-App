-- Step 15 speed check, rolled back at the end: the rate limit on each sign-in step, and deleting the
-- heaviest account (50 albums of 200 photos = 10,000 photos and 20,000 files, 2,000 group posts with
-- 2,000 comments by others, 20 DMs with 50 messages each).
-- Targets: the rate limit adds under 5 ms to a login; deleting an account is a one-off, under 2 s.
-- Run: npx supabase db query --linked -f scripts/speed/17_launch.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated, service_role;
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking;
grant select on seed to authenticated, service_role;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('7f000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed15-' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed15 ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 21) as n;
update public.members set state = 'approved' where user_id::text like '7f000000-%';

-- Member 1: 50 albums of 200 photos, every file in Storage.
insert into public.albums (id, community_id, owner_id, name)
select ('7f000000-0000-4000-9000-' || lpad(a::text, 12, '0'))::uuid, seed.biking, pg_temp.u(1), 'Test album ' || a from seed, generate_series(1, 50) as a;
create temp table seeded as
select ('7f000000-0000-4000-9000-' || lpad(a::text, 12, '0'))::uuid as album_id, k, gen_random_uuid() as photo_id
from generate_series(1, 50) as a, generate_series(1, 200) as k;
insert into public.photos (id, community_id, owner_id, bucket, path, thumb_path, purpose)
select photo_id, seed.biking, pg_temp.u(1), 'private', seed.biking || '/' || pg_temp.u(1) || '/' || photo_id || '.webp', seed.biking || '/' || pg_temp.u(1) || '/' || photo_id || '_t.webp', 'album'
from seed, seeded;
insert into public.album_photos (album_id, photo_id, community_id, position) select album_id, photo_id, seed.biking, k from seed, seeded;
insert into storage.objects (bucket_id, name)
select 'private', seed.biking || '/' || pg_temp.u(1) || '/' || photo_id || s.suffix from seed, seeded, (values ('.webp'), ('_t.webp')) as s (suffix);

-- A group with 2,000 posts by member 1, each with a comment by member 2; 20 DMs of 50 messages.
insert into public.chats (id, community_id, kind, name, created_by, last_seq)
select '7f000000-0000-4000-a000-000000000000', biking, 'group', 'Test speed15 group', pg_temp.u(2), 4000 from seed;
insert into public.chat_members (chat_id, community_id, user_id)
select '7f000000-0000-4000-a000-000000000000', biking, pg_temp.u(n) from seed, generate_series(1, 2) as n;
insert into public.messages (chat_id, seq, community_id, author_id, body, reply_to_seq)
select '7f000000-0000-4000-a000-000000000000', s, biking, pg_temp.u(case when s % 2 = 1 then 1 else 2 end), 'Test ' || s, case when s % 2 = 0 then s - 1 end
from seed, generate_series(1, 4000) as s;
insert into public.chats (id, community_id, kind, dm_user_a, dm_user_b, created_by, last_seq)
select ('7f000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid, biking, 'dm', least(pg_temp.u(1), pg_temp.u(n)), greatest(pg_temp.u(1), pg_temp.u(n)), pg_temp.u(1), 50
from seed, generate_series(2, 21) as n;
insert into public.chat_members (chat_id, community_id, user_id)
select ('7f000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid, biking, u from seed, generate_series(2, 21) as n, unnest(array[pg_temp.u(1), pg_temp.u(n)]) as u;
insert into public.messages (chat_id, seq, community_id, author_id, body)
select ('7f000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid, s, biking, case when s % 2 = 0 then pg_temp.u(1) else pg_temp.u(n) end, 'Test ' || s
from seed, generate_series(2, 21) as n, generate_series(1, 50) as s;
analyze public.photos, public.messages, public.chats, public.album_photos;

create function pg_temp.time(p_name text, p_sql text, p_target numeric, p_runs integer default 5) returns void language plpgsql as $$
declare
  v_plan json;
  v_best numeric;
  v_ms numeric;
begin
  for i in 1..p_runs loop
    execute 'explain (analyze, format json) ' || p_sql into v_plan;
    v_ms := (v_plan -> 0 ->> 'Execution Time')::numeric;
    v_best := least(coalesce(v_best, v_ms), v_ms);
  end loop;
  insert into pg_temp.speed values (p_name, round(v_best, 2), p_target);
end
$$;
grant execute on function pg_temp.time(text, text, numeric, integer), pg_temp.u(integer) to authenticated, service_role;

set local role service_role;
select pg_temp.time('rate_limit_take: a login (IP + login key)', 'select public.rate_limit_take(''password'', array[''ip:speed15'', ''login:speed15''], array[1000, 1000], 900)', 5);
select pg_temp.time('rate_limit_refund', 'select public.rate_limit_refund(''password'', array[''login:speed15''])', 5);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
select pg_temp.time('delete_my_account: 10,000 photos, 20,000 files, 4,000 posts, 20 DMs', format('select public.delete_my_account(%L)', (select biking from seed)), 2000, 1);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result,
  (select count(*) from public.members where user_id = pg_temp.u(1)) as account_left
from speed;
rollback;
