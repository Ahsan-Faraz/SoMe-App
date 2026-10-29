-- Step 14 speed check: ads, rolled back at the end. 5,000 members across 3 Statuses with a birth date
-- per person, 2 ads each (10,000; half with an image), 1,000 of the viewer's notes, 400 blocks around
-- the viewer, 1 in 50 hidden from search. Timed as the viewer (best of 5). Target: the Ads tab is a
-- search, under 50 ms (§11); one ad and the writes under 15 ms.
-- Also: what a Storage policy would cost to sign a page's 30 thumbnails (the check per file), against
-- signing on the server after search_ads (no per-file check).
-- Run: npx supabase db query --linked -f scripts/speed/16_ads.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking;
grant select on seed to authenticated;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('7e000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.option(p_list text, p_label text) returns uuid language sql stable as $$
  select o.id from public.community_options o join seed on o.community_id = seed.biking where o.list = p_list and o.label ->> 'en' = p_label
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed14-' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed14 ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 5000) as n;

create temp table statuses as select array[pg_temp.option('status', 'Man'), pg_temp.option('status', 'Woman'), pg_temp.option('status', 'Couple MF')] as ids;
create temp table districts as select array(select o.id from public.community_options o join seed on o.community_id = seed.biking where o.list = 'district' order by o.position) as ids;
grant select on districts to authenticated;
update public.members m set state = 'approved', visible_in_search = (n % 50 <> 0), score = (hashtext(m.user_id::text) & 100), status_id = s.ids[1 + n % 3]
from statuses s, (select generate_series(1, 5000) as n) as g
where m.user_id = pg_temp.u(g.n);

-- A birth date for each person of the Status: 18 to 70 years old.
insert into public.profile_people (community_id, user_id, substatus_id, n, birth_date)
select seed.biking, pg_temp.u(g.n), sl.substatus_id, k, current_date - ((18 + (g.n * 7 + k * 13) % 52) * 365 + g.n % 365)
from seed cross join statuses s cross join generate_series(1, 5000) as g (n)
join public.status_slots sl on sl.status_id = s.ids[1 + g.n % 3]
cross join generate_series(1, sl.count) as k;

-- 2 ads each over the last 100 days: Looking for one or two Statuses, a district, a place on a tenth,
-- a text of about 200 characters; the even ones with an image.
create temp table seeded as
select gen_random_uuid() as id, pg_temp.u(n) as user_id, n, a, gen_random_uuid() as photo_id
from generate_series(1, 5000) as n, generate_series(1, 2) as a;
insert into public.photos (id, community_id, owner_id, bucket, path, thumb_path, width, height, purpose)
select photo_id, seed.biking, user_id, 'private', seed.biking || '/' || user_id || '/' || photo_id || '.webp', seed.biking || '/' || user_id || '/' || photo_id || '_t.webp', 1600, 1200, 'ad'
from seed, seeded where a = 2;
insert into public.ads (id, community_id, user_id, looking_for, headline, body, district_id, place, photo_id, published_at)
select x.id, seed.biking, x.user_id,
  case when x.n % 4 = 0 then array[s.ids[1 + x.n % 3], s.ids[1 + (x.n + 1) % 3]] else array[s.ids[1 + (x.n / 3) % 3]] end,
  'Test speed14 ad ' || x.n || '-' || x.a, repeat('Test riding text ' || md5(x.n::text || x.a) || ' ', 4),
  d.ids[1 + x.n % cardinality(d.ids)], case when x.n % 10 = 0 then 'Test Place ' || (x.n % 97) else '' end,
  case when x.a = 2 then x.photo_id end, now() - make_interval(mins => (x.n * 2 + x.a) * 14)
from seed, statuses s, districts d, seeded x;

-- The viewer (1): 1,000 notes with stars, blocked 200 and blocked by 200.
insert into public.notes (community_id, author_id, subject_id, stars)
select seed.biking, pg_temp.u(1), pg_temp.u(n), 1 + n % 5 from seed, generate_series(1000, 1999) as n;
insert into public.blocks (community_id, blocker_id, blocked_id)
select seed.biking, pg_temp.u(1), pg_temp.u(n) from seed, generate_series(2, 201) as n
union all select seed.biking, pg_temp.u(n), pg_temp.u(1) from seed, generate_series(202, 401) as n;

-- Uploaded files for the writes (member 1, 5 timed runs each of publish and edit).
insert into storage.objects (bucket_id, name)
select 'private', seed.biking || '/' || pg_temp.u(1) || '/7e000000-0000-4000-9000-0000000000' || lpad(n::text, 2, '0') || s.suffix
from seed, generate_series(1, 10) as n, (values ('.webp'), ('_t.webp')) as s (suffix);
create temp table uploads (n serial, path text);
insert into uploads (path) select seed.biking || '/' || pg_temp.u(1) || '/7e000000-0000-4000-9000-0000000000' || lpad(n::text, 2, '0') || '.webp' from seed, generate_series(1, 10) as n;
create function pg_temp.next_upload() returns jsonb language sql volatile security definer as $$
  with taken as (delete from uploads where n = (select min(n) from uploads) returning path)
  select jsonb_build_object('path', path, 'thumb_path', regexp_replace(path, '\.webp$', '_t.webp'), 'width', 1600, 'height', 1200, 'taken_in_app', false) from taken
$$;
-- Member 1's own ads to edit and delete (after the timed publishes, below).
create temp table mine (n serial, id uuid);
grant all on mine to authenticated;
grant usage on sequence mine_n_seq to authenticated;
create function pg_temp.next_mine() returns uuid language sql volatile security definer as $$
  with taken as (delete from mine where n = (select min(n) from mine) returning id) select id from taken
$$;

analyze public.ads, public.members, public.profile_people, public.notes, public.blocks, public.photos;

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
-- The viewer saves a filter (as the app does), then the Ads tab is timed.
create function pg_temp.search(p_name text, p_filter jsonb, p_target numeric default 50) returns void language plpgsql as $$
begin
  perform public.save_ad_filter((select biking from seed), p_filter);
  perform pg_temp.time(p_name, format('select * from public.search_ads(%L)', (select biking from seed)), p_target);
end
$$;
-- What a Storage policy on ad files would check for each signed file: a photo of an ad the caller may see.
create function pg_temp.can_read_ad_photo(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.photos p join public.ads a on a.community_id = p.community_id and a.photo_id = p.id
    where p.bucket = 'private' and p.purpose = 'ad' and (p.path = p_name or p.thumb_path = p_name)
      and private.can_see_ads(a.community_id, a.user_id)
  )
$$;
grant execute on function pg_temp.time(text, text, numeric, integer), pg_temp.search(text, jsonb, numeric), pg_temp.u(integer), pg_temp.option(text, text),
  pg_temp.next_upload(), pg_temp.next_mine(), pg_temp.can_read_ad_photo(text) to authenticated;

-- Picked before the role changes (clients can't read the ads table): a page 4,000 ads deep, one ad.
create temp table picked as select
  (select published_at from public.ads where user_id = pg_temp.u(2000) order by published_at limit 1) as deep_published,
  (select id from public.ads where user_id = pg_temp.u(2000) order by published_at limit 1) as deep_id,
  (select id from public.ads where user_id = pg_temp.u(3000) limit 1) as one_ad;
grant select on picked to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);

select pg_temp.search('search_ads: first page, no filter', '{}');
select pg_temp.search('search_ads: Status', jsonb_build_object('statuses', jsonb_build_array(pg_temp.option('status', 'Woman'))));
select pg_temp.search('search_ads: three filters (Status, Looking for, district)', jsonb_build_object(
  'statuses', jsonb_build_array(pg_temp.option('status', 'Woman')), 'looking_for', jsonb_build_array(pg_temp.option('status', 'Man')),
  'districts', jsonb_build_array((select ids[1] from districts))));
select pg_temp.search('search_ads: age 30-35', '{"age_min": 30, "age_max": 35}');
select pg_temp.search('search_ads: score min 90', '{"score_min": 90}');
select pg_temp.search('search_ads: my stars 4-5', '{"stars_min": 4, "stars_max": 5}');
select pg_temp.search('search_ads: text in the ad (some match)', '{"text": "test place 1"}');
select pg_temp.search('search_ads: text that matches nobody (every ad checked)', '{"text": "zzzz nobody"}');
select pg_temp.search('search_ads: place that matches nobody', '{"place": "zzzz"}');
select public.save_ad_filter((select biking from seed), '{}');
select pg_temp.time('search_ads: a page 4,000 ads deep (keyset)', format('select * from public.search_ads(%L, 30, %L, %L)',
  (select biking from seed), (select deep_published from picked), (select deep_id from picked)), 50);
select pg_temp.time('member_ads: someone''s ads', format('select * from public.member_ads(%L, %L)', (select biking from seed), pg_temp.u(3000)), 15);
select pg_temp.time('ad_view: one ad', format('select public.ad_view(%L, %L)', (select biking from seed),
  (select one_ad from picked)), 15);

-- Signing a page's 30 thumbnails. Server: search_ads checked access; signing does no check per file.
-- Policy: the check above, once per file.
select pg_temp.time('Storage policy (not built): 30 thumbnails checked one by one', format('select count(*) from unnest(%L::text[]) as n where pg_temp.can_read_ad_photo(n)',
  (select array_agg(photo_thumb) from public.search_ads((select biking from seed)) where photo_thumb is not null)), 15);

select pg_temp.time('save_ad: publish with an image', format(
  'select public.save_ad(%L, null, array[%L]::uuid[], %L, %L, null, %L, pg_temp.next_upload())',
  (select biking from seed), pg_temp.option('status', 'Man'), 'Test new ad', 'Test text', ''), 15);
reset role;
insert into mine (id) select id from public.ads where user_id = pg_temp.u(1) and headline = 'Test new ad';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
select pg_temp.time('save_ad: edit, new image', format(
  'select public.save_ad(%L, (select id from mine order by n limit 1), array[%L]::uuid[], %L, %L, null, %L, pg_temp.next_upload())',
  (select biking from seed), pg_temp.option('status', 'Woman'), 'Test edited ad', 'Test text', ''), 15);
select pg_temp.time('delete_ad', format('select public.delete_ad(%L, pg_temp.next_mine())', (select biking from seed)), 15);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result,
  (select count(*) from public.ads where user_id::text like '7e000000-%') as seeded_ads
from speed;
rollback;
