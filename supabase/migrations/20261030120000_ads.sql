-- Step 14: ads (A6, D1–D3). A member's ads: Looking for (Statuses, multi), headline, text, district,
-- place and an image (camera = Taken in app, an upload, or "From profile/album", always a new copy in
-- the author's folder of the private bucket). Age, Status and profile score are never copied onto the
-- ad: every read takes them from the author's profile, so they can't go out of date.
-- No client grants on the table: every read and write is an RPC that checks the caller and the
-- community. Ads are read by approved members, never across a block (either way), never from a
-- member who is no longer approved; the Ads tab (search_ads) also leaves out members hidden from search.
-- Only adds (a table, a members column with a default, functions): nothing the deployed build calls changes.

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  user_id uuid not null,
  looking_for uuid[] not null check (cardinality(looking_for) between 1 and 200), -- Status ids (CHOICES_MAX)
  headline text not null check (char_length(headline) between 1 and 120 and headline = btrim(headline)), -- HEADLINE_MAX
  body text not null default '' check (char_length(body) <= 4000), -- LONG_TEXT_MAX
  district_id uuid,
  place text not null default '' check (char_length(place) <= 80), -- PLACE_MAX
  photo_id uuid,
  published_at timestamptz not null default now(),
  updated_at timestamptz,
  -- The text the Ads tab's text filter looks in, lower-cased once when the ad is saved, not per search
  -- (lower() of every ad's headline, text and place took most of a text search: scripts/speed/16_ads.sql).
  search_text text not null generated always as (lower(headline || ' ' || body || ' ' || place)) stored,
  unique (community_id, id),
  foreign key (community_id, user_id) references public.members on delete cascade,
  foreign key (community_id, district_id) references public.community_options (community_id, id) on delete set null (district_id),
  foreign key (community_id, photo_id) references public.photos (community_id, id) on delete set null (photo_id)
);
-- The Ads tab: newest first, keyset on (published_at, id).
create index ads_recent on public.ads (community_id, published_at desc, id desc);
-- A member's ads (My ads, a profile's Ads, the cap, the cascade from members).
create index ads_user on public.ads (community_id, user_id, published_at desc, id desc);
-- The foreign keys' other side: deleting a photo or a district finds its ads.
create index ads_photo on public.ads (community_id, photo_id) where photo_id is not null;
create index ads_district on public.ads (community_id, district_id) where district_id is not null;

alter table public.ads enable row level security;
revoke all on public.ads from anon, authenticated;

-- The saved ad filter (D1, "saved on the account"). Written only by save_ad_filter, which keeps known
-- ids only, so search_ads can read it without checks. Not readable as a column (members has column
-- grants): ad_filter() returns your own.
alter table public.members
  add column ad_filter jsonb not null default '{}'
    check (jsonb_typeof(ad_filter) = 'object' and pg_column_size(ad_filter) <= 8192);

-- ---------------------------------------------------------------------------------------------
-- The filter

create function public.save_ad_filter(p_community uuid, p_filter jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
begin
  if v_member.state <> 'approved' then
    raise exception 'only members search ads' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filter) is distinct from 'object' then
    raise exception 'a filter is an object' using errcode = '22023';
  end if;
  update public.members
  set ad_filter = jsonb_strip_nulls(jsonb_build_object(
    'text', private.filter_text(p_filter -> 'text'),
    'statuses', private.filter_choices(p_community, 'status', p_filter -> 'statuses'),
    'looking_for', private.filter_choices(p_community, 'status', p_filter -> 'looking_for'),
    'districts', private.filter_choices(p_community, 'district', p_filter -> 'districts'),
    'place', private.filter_text(p_filter -> 'place'),
    'age_min', private.filter_int(p_filter -> 'age_min', 0, 150),
    'age_max', private.filter_int(p_filter -> 'age_max', 0, 150),
    'score_min', private.filter_int(p_filter -> 'score_min', 0, 100),
    'stars_min', private.filter_int(p_filter -> 'stars_min', 0, 5),
    'stars_max', private.filter_int(p_filter -> 'stars_max', 0, 5)
  ))
  where community_id = p_community and user_id = v_member.user_id;
end
$$;

create function public.ad_filter(p_community uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select ad_filter from public.members
  where community_id = p_community and user_id = (select auth.uid()) and state = 'approved'
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads. Each returns the author's username, Status, ages (one per person of the Status, from the
-- birth dates), score and my stars as they are now, and the ad's photo paths for the server to sign.

-- The ages of a member's people, in their Status's order (as search_profiles and profile() give them).
create function private.member_ages(p_community uuid, p_user uuid, p_status uuid) returns integer[]
language sql stable security definer set search_path = '' as $$
  select array(
    select extract(year from age(current_date, pp.birth_date))::integer
    from private.status_people(p_status) as s
    join public.profile_people pp
      on pp.community_id = p_community and pp.user_id = p_user
      and pp.substatus_id is not distinct from s.substatus_id and pp.n = s.n
    order by s.k
  )
$$;

-- A6: the Ads tab through your saved filter, newest first (keyset on published_at, id). Your own ads
-- are in it too. The filter: text (headline, text, author, place, district name), the author's Status,
-- age and score (from the profile, as in search_profiles: age and score only while the community shows
-- them), the ad's Looking for, district and place, my stars for the author.
create function public.search_ads(p_community uuid, p_limit integer default 30, p_after_published timestamptz default null, p_after_id uuid default null)
returns table (
  id uuid, user_id uuid, username text, status_id uuid, ages integer[], score smallint, looking_for uuid[],
  headline text, district_id uuid, place text, published_at timestamptz,
  photo_path text, photo_thumb text, photo_taken_in_app boolean, stars smallint
)
language sql stable security definer set search_path = '' as $$
  with f as materialized (
    select v.user_id as viewer, c.show_visibility,
      private.like_pattern(v.ad_filter ->> 'text') as text,
      array(select x::uuid from jsonb_array_elements_text(v.ad_filter -> 'statuses') as x) as statuses,
      array(select x::uuid from jsonb_array_elements_text(v.ad_filter -> 'looking_for') as x) as looking_for,
      array(select x::uuid from jsonb_array_elements_text(v.ad_filter -> 'districts') as x) as districts,
      private.like_pattern(v.ad_filter ->> 'place') as place,
      -- age >= min: born on or before today minus min years; age <= max: born after today minus max + 1.
      case when c.show_age then (current_date - make_interval(years => (v.ad_filter ->> 'age_min')::integer))::date end as born_by,
      case when c.show_age then (current_date - make_interval(years => (v.ad_filter ->> 'age_max')::integer + 1))::date end as born_after,
      case when c.show_score then (v.ad_filter ->> 'score_min')::smallint end as score_min,
      (v.ad_filter ->> 'stars_min')::smallint as stars_min,
      (v.ad_filter ->> 'stars_max')::smallint as stars_max
    from public.members v
    join public.communities c on c.id = v.community_id
    where v.community_id = p_community and v.user_id = (select auth.uid()) and v.state = 'approved'
  ),
  -- People in a block with you, either way: one hashed set.
  hidden as materialized (
    select b.blocked_id as id from f join public.blocks b on b.community_id = p_community and b.blocker_id = f.viewer
    union all
    select b.blocker_id from f join public.blocks b on b.community_id = p_community and b.blocked_id = f.viewer
  ),
  -- Districts whose name contains the text, in any language.
  text_districts as materialized (
    select o.id
    from f join public.community_options o on o.community_id = p_community and o.list = 'district'
    where f.text is not null and exists (select 1 from jsonb_each_text(o.label) as l where lower(l.value) like f.text)
  ),
  -- The authors whose ads may show, with the filters on their profile: one hashed set, worked out once.
  -- (Joined to every ad instead, the planner read all of them before it sorted: 46 ms for the first page.)
  authors as materialized (
    select m.user_id
    from public.members m
    cross join f
    where m.community_id = p_community and m.state = 'approved' and not m.is_system
      and (m.user_id = f.viewer or m.visible_in_search or not f.show_visibility)
      and m.user_id not in (select id from hidden)
      and (cardinality(f.statuses) = 0 or m.status_id = any(f.statuses))
      and (f.score_min is null or m.score >= f.score_min)
      and (f.stars_min is null and f.stars_max is null or coalesce((
        select n.stars from public.notes n where n.community_id = p_community and n.author_id = f.viewer and n.subject_id = m.user_id
      ), 0) between coalesce(f.stars_min, 0) and coalesce(f.stars_max, 5))
      and (f.born_by is null and f.born_after is null or exists (
        select 1 from public.profile_people pp
        where pp.community_id = p_community and pp.user_id = m.user_id
          and (f.born_by is null or pp.birth_date <= f.born_by)
          and (f.born_after is null or pp.birth_date > f.born_after)
          -- a person of the member's current Status (an admin may have changed it since)
          and case when pp.substatus_id is null then not exists (select 1 from public.status_slots s where s.status_id = m.status_id)
            else exists (select 1 from public.status_slots s where s.status_id = m.status_id and s.substatus_id = pp.substatus_id and pp.n <= s.count) end
      ))
  ),
  -- Authors whose name contains the text, found once (the pattern is a fixed value here, not a column per row).
  text_authors as materialized (
    select m.user_id
    from public.members m
    where m.community_id = p_community and lower(m.username) like (select text from f)
  ),
  -- The page (ids only), newest first; the author's ages, the photo and my stars are added for its rows.
  page as materialized (
    select a.id, a.published_at
    from public.ads a
    cross join f
    where a.community_id = p_community
      -- Inside CASE the planner keeps this a hashed lookup per ad; written plainly it became a join
      -- that fetched every author's ads before sorting (9,000 rows for a page of 30: 31 ms).
      and case when a.user_id in (select user_id from authors) then true else false end
      and (cardinality(f.looking_for) = 0 or a.looking_for && f.looking_for)
      and (cardinality(f.districts) = 0 or a.district_id = any(f.districts))
      and (f.place is null or lower(a.place) like f.place)
      and (f.text is null
        or a.search_text like f.text
        or a.user_id in (select user_id from text_authors)
        or a.district_id in (select id from text_districts))
      and (p_after_published is null or (a.published_at, a.id) < (p_after_published, p_after_id))
    order by a.published_at desc, a.id desc
    limit least(greatest(p_limit, 1), 100)
  )
  select a.id, a.user_id, m.username, m.status_id, private.member_ages(p_community, m.user_id, m.status_id), m.score, a.looking_for,
    a.headline, a.district_id, a.place, a.published_at, p.path, p.thumb_path, p.taken_in_app, n.stars
  from page g
  join public.ads a on a.id = g.id
  join public.members m on m.community_id = p_community and m.user_id = a.user_id
  left join public.photos p on p.id = a.photo_id
  left join public.notes n on n.community_id = p_community and n.author_id = (select auth.uid()) and n.subject_id = a.user_id
  order by g.published_at desc, g.id desc
$$;

-- May the caller see this member's ads? Themselves (approved); else both approved, no block either way.
-- (Like a profile, minus the admin's view: an admin doesn't see a blocked person's ads either.)
create function private.can_see_ads(p_community uuid, p_author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_approved(p_community))
    and (p_author = (select auth.uid())
      or (exists (select 1 from public.members where community_id = p_community and user_id = p_author and state = 'approved' and not is_system)
        and not private.blocked_pair(p_community, (select auth.uid()), p_author)))
$$;

-- My ads (C9) and a profile's Ads: one member's ads, newest first, unfiltered. At most 20 exist.
create function public.member_ads(p_community uuid, p_user uuid)
returns table (
  id uuid, user_id uuid, username text, status_id uuid, ages integer[], score smallint, looking_for uuid[],
  headline text, district_id uuid, place text, published_at timestamptz,
  photo_path text, photo_thumb text, photo_taken_in_app boolean, stars smallint
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id, m.username, m.status_id, private.member_ages(p_community, m.user_id, m.status_id), m.score, a.looking_for,
    a.headline, a.district_id, a.place, a.published_at, p.path, p.thumb_path, p.taken_in_app, n.stars
  from public.ads a
  join public.members m on m.community_id = p_community and m.user_id = a.user_id
  left join public.photos p on p.id = a.photo_id
  left join public.notes n on n.community_id = p_community and n.author_id = (select auth.uid()) and n.subject_id = a.user_id
  where (select private.can_see_ads(p_community, p_user))
    and a.community_id = p_community and a.user_id = p_user
  order by a.published_at desc, a.id desc
  limit 50
$$;

-- D2/D3: one ad, with its text and full-size photo. Null when the caller may not see it.
create function public.ad_view(p_community uuid, p_ad uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'user_id', a.user_id, 'own', a.user_id = (select auth.uid()), 'username', m.username,
    'status_id', m.status_id, 'ages', to_jsonb(private.member_ages(p_community, m.user_id, m.status_id)), 'score', m.score,
    'looking_for', to_jsonb(a.looking_for), 'headline', a.headline, 'body', a.body,
    'district_id', a.district_id, 'place', a.place, 'published_at', a.published_at,
    'photo', case when p.id is not null then jsonb_build_object(
      'path', p.path, 'thumb_path', p.thumb_path, 'width', p.width, 'height', p.height, 'taken_in_app', p.taken_in_app, 'taken_at', p.taken_at
    ) end
  )
  from public.ads a
  join public.members m on m.community_id = p_community and m.user_id = a.user_id
  left join public.photos p on p.id = a.photo_id
  where a.id = p_ad and a.community_id = p_community
    and private.can_see_ads(p_community, a.user_id)
$$;

-- Storage: no policy lets others read ad files. The server signs a page's files (service role) right
-- after search_ads / member_ads / ad_view returned them, so the access check runs once per page,
-- not once per file (photos has no index on its paths; see scripts/speed/16_ads.sql). The author
-- reads their own folder through private_photos_own_read.

-- ---------------------------------------------------------------------------------------------
-- Writes (the author's)

-- Publish (p_ad null) or edit your ad. p_looking_for: 1 or more of the community's Statuses;
-- p_district: one of its districts or null. p_photo null keeps the current image; an uploaded photo
-- ({path, thumb_path, width, height, taken_in_app}, both files in your folder of the private bucket)
-- replaces it. At most 20 ads each. Returns {id, files}: the replaced image's files, for the server
-- to remove from Storage after the response.
create function public.save_ad(
  p_community uuid, p_ad uuid, p_looking_for uuid[], p_headline text, p_body text, p_district uuid, p_place text, p_photo jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_headline text := btrim(coalesce(p_headline, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_place text := btrim(coalesce(p_place, ''));
  v_looking uuid[];
  v_ad public.ads;
  v_photo uuid;
  v_files text[] := '{}';
begin
  if not (select private.is_approved(p_community)) then
    raise exception 'members only' using errcode = '42501';
  end if;
  if char_length(v_headline) not between 1 and 120 or char_length(v_body) > 4000 or char_length(v_place) > 80 then
    raise exception 'a headline is 1 to 120 characters, a text at most 4000, a place at most 80' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_looking_for), 0) not between 1 and 200 then
    raise exception 'choose 1 or more in Looking for' using errcode = '22023';
  end if;
  select array_agg(o.id order by o.position, o.id) into v_looking
  from public.community_options o
  where o.community_id = p_community and o.list = 'status' and o.id = any (p_looking_for);
  if coalesce(cardinality(v_looking), 0) <> (select count(distinct x) from unnest(p_looking_for) as x) then
    raise exception 'Looking for takes this community''s Statuses' using errcode = '22023';
  end if;
  if p_district is not null and not exists (
    select 1 from public.community_options where community_id = p_community and list = 'district' and id = p_district
  ) then
    raise exception 'not a district of this community' using errcode = '22023';
  end if;

  if p_ad is null then
    -- One member's own rows: the lock keeps two quick taps from passing the cap together.
    perform 1 from public.members where community_id = p_community and user_id = v_uid for update;
    if (select count(*) from public.ads where community_id = p_community and user_id = v_uid) >= 20 then
      raise exception 'at most 20 ads' using errcode = '22023';
    end if;
  else
    select * into v_ad from public.ads where id = p_ad and community_id = p_community and user_id = v_uid for update;
    if not found then
      raise exception 'only the ad''s author can change it' using errcode = '42501';
    end if;
  end if;

  if p_photo is not null then
    v_photo := private.insert_photo(p_community, p_photo, 'private', 'ad');
  end if;

  if p_ad is null then
    insert into public.ads (community_id, user_id, looking_for, headline, body, district_id, place, photo_id)
    values (p_community, v_uid, v_looking, v_headline, v_body, p_district, v_place, v_photo)
    returning * into v_ad;
  else
    update public.ads
    set looking_for = v_looking, headline = v_headline, body = v_body, district_id = p_district, place = v_place,
      photo_id = coalesce(v_photo, photo_id), updated_at = now()
    where id = p_ad;
    -- The image it replaced: the row now, its files after the response.
    if v_photo is not null and v_ad.photo_id is not null then
      with gone as (delete from public.photos where id = v_ad.photo_id returning path, thumb_path)
      select coalesce(array_agg(x.path), '{}') into v_files from gone cross join lateral (values (gone.path), (gone.thumb_path)) as x (path);
    end if;
  end if;
  return jsonb_build_object('id', v_ad.id, 'files', to_jsonb(v_files));
end
$$;

-- Delete your ad and its image. Returns {files} for the server to remove from Storage.
create function public.delete_ad(p_community uuid, p_ad uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ad public.ads;
  v_files text[] := '{}';
begin
  if not (select private.is_approved(p_community)) then
    raise exception 'members only' using errcode = '42501';
  end if;
  delete from public.ads where id = p_ad and community_id = p_community and user_id = (select auth.uid()) returning * into v_ad;
  if not found then
    raise exception 'only the ad''s author can delete it' using errcode = '42501';
  end if;
  if v_ad.photo_id is not null then
    with gone as (delete from public.photos where id = v_ad.photo_id returning path, thumb_path)
    select coalesce(array_agg(x.path), '{}') into v_files from gone cross join lateral (values (gone.path), (gone.thumb_path)) as x (path);
  end if;
  return jsonb_build_object('files', to_jsonb(v_files));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.member_ages(uuid, uuid, uuid), private.can_see_ads(uuid, uuid) from public, anon, authenticated;

revoke execute on function
  public.save_ad_filter(uuid, jsonb), public.ad_filter(uuid),
  public.search_ads(uuid, integer, timestamptz, uuid), public.member_ads(uuid, uuid), public.ad_view(uuid, uuid),
  public.save_ad(uuid, uuid, uuid[], text, text, uuid, text, jsonb), public.delete_ad(uuid, uuid)
from public, anon;
grant execute on function
  public.save_ad_filter(uuid, jsonb), public.ad_filter(uuid),
  public.search_ads(uuid, integer, timestamptz, uuid), public.member_ads(uuid, uuid), public.ad_view(uuid, uuid),
  public.save_ad(uuid, uuid, uuid[], text, text, uuid, text, jsonb), public.delete_ad(uuid, uuid)
to authenticated;
