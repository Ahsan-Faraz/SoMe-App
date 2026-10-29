-- Step 13 speed check: albums, rolled back at the end. 1,000 members with 2 albums of 10 photos each,
-- and one member at the limits: 50 albums of 200 photos (10,000), half of them locked. Timed as
-- another member (reads, the password) and as the owner (writes, Storage for their own files), best of 5.
-- Run: npx supabase db query --linked -f scripts/speed/15_albums.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking;
grant select on seed to authenticated;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('7d000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed13-' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed13 ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 1000) as n;
update public.members set state = 'approved' where user_id::text like '7d000000-%';

-- Member 1: 50 albums (the even ones locked) of 200 photos. Members 2–1000: 2 albums of 10.
insert into public.albums (id, community_id, owner_id, name, password_hash)
select gen_random_uuid(), seed.biking, pg_temp.u(1), 'Test album ' || a, case when a % 2 = 0 then extensions.crypt('ride' || a, extensions.gen_salt('bf', 10)) end
from seed, generate_series(1, 50) as a;
insert into public.albums (community_id, owner_id, name)
select seed.biking, pg_temp.u(m), 'Test album ' || a from seed, generate_series(2, 1000) as m, generate_series(1, 2) as a;

create temp table seeded as
select a.id as album_id, a.community_id, a.owner_id, k, gen_random_uuid() as photo_id
from public.albums a cross join lateral generate_series(1, case when a.owner_id = pg_temp.u(1) then 200 else 10 end) as k
where a.owner_id::text like '7d000000-%';
insert into public.photos (id, community_id, owner_id, bucket, path, thumb_path, width, height, purpose)
select photo_id, community_id, owner_id, 'private', community_id || '/' || owner_id || '/' || photo_id || '.webp', community_id || '/' || owner_id || '/' || photo_id || '_t.webp', 1600, 1200, 'album'
from seeded;
insert into public.album_photos (album_id, photo_id, community_id, position) select album_id, photo_id, community_id, k from seeded;
insert into storage.objects (bucket_id, name)
select 'private', community_id || '/' || owner_id || '/' || photo_id || s.suffix from seeded, (values ('.webp'), ('_t.webp')) as s (suffix) where owner_id = pg_temp.u(1);
-- Files to add as the owner (5 timed runs), already uploaded.
insert into storage.objects (bucket_id, name)
select 'private', seed.biking || '/' || pg_temp.u(2) || '/7d000000-0000-4000-9000-00000000000' || n || s.suffix from seed, generate_series(1, 5) as n, (values ('.webp'), ('_t.webp')) as s (suffix);
create temp table uploads (n serial, path text);
insert into uploads (path) select seed.biking || '/' || pg_temp.u(2) || '/7d000000-0000-4000-9000-00000000000' || n || '.webp' from seed, generate_series(1, 5) as n;
analyze public.albums;
analyze public.album_photos;
analyze public.photos;

-- Picked as the owner: an open and a locked album of member 1, 200 of their file names, an album of member 2.
create temp table picked as select
  (select id from public.albums where owner_id = pg_temp.u(1) and name = 'Test album 1') as open_album,
  (select id from public.albums where owner_id = pg_temp.u(1) and name = 'Test album 2') as locked_album,
  (select id from public.albums where owner_id = pg_temp.u(2) limit 1) as own_album,
  (select array_agg(p.thumb_path) from public.photos p join public.album_photos ap on ap.photo_id = p.id
   join public.albums a on a.id = ap.album_id where a.owner_id = pg_temp.u(1) and a.name = 'Test album 1') as thumbs;
grant select on picked to authenticated;
create function pg_temp.next_upload() returns jsonb language sql volatile security definer as $$
  with taken as (delete from uploads where n = (select min(n) from uploads) returning path)
  select jsonb_build_object('path', path, 'thumb_path', regexp_replace(path, '\.webp$', '_t.webp'), 'width', 1600, 'height', 1200) from taken
$$;

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
grant execute on function pg_temp.time(text, text, numeric, integer), pg_temp.u(integer), pg_temp.next_upload() to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(500), 'role', 'authenticated')::text, true);
select pg_temp.time('album_list: 50 albums (covers, counts)', format('select * from public.album_list(%L, %L)', (select biking from seed), pg_temp.u(1)), 15);
select pg_temp.time('album_view: open, 200 photos', format('select public.album_view(%L, %L)', (select biking from seed), (select open_album from picked)), 15);
select pg_temp.time('album_view: locked', format('select public.album_view(%L, %L)', (select biking from seed), (select locked_album from picked)), 15);
select pg_temp.time('open_album: wrong password (bcrypt)', format('select public.open_album(%L, %L, %L)', (select biking from seed), (select locked_album from picked), 'nope'), 200);
-- Once, as someone else: after it the album is open for them (no bcrypt), and 5 wrong tries above make Member 500 wait.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(501), 'role', 'authenticated')::text, true);
select pg_temp.time('open_album: right password (bcrypt, once)', format('select public.open_album(%L, %L, %L)', (select biking from seed), (select locked_album from picked), 'ride2'), 200, 1);
select pg_temp.time('open_album: already open (no bcrypt)', format('select public.open_album(%L, %L, %L)', (select biking from seed), (select locked_album from picked), 'ride2'), 15);

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
select pg_temp.time('my_album_photos: 10,000 own (newest 200)', format('select * from public.my_album_photos(%L)', (select biking from seed)), 15);
-- The picker signs the owner's own files through Storage (own-folder policy): 200 thumbnails, one call.
select pg_temp.time('Storage check: 200 own thumbnails (one signing call)', format('select count(*) from storage.objects where bucket_id = %L and name = any (%L)',
  'private', (select thumbs from picked)), 50);

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(2), 'role', 'authenticated')::text, true);
select pg_temp.time('add_album_photo', format('select public.add_album_photo(%L, %L, pg_temp.next_upload())', (select biking from seed), (select own_album from picked)), 15);
select pg_temp.time('create_album', format('select public.create_album(%L, %L)', (select biking from seed), 'Test new album'), 15);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result,
  (select count(*) from public.photos where owner_id::text like '7d000000-%') as seeded_photos
from speed;
rollback;
