-- Step 18: client feedback 261111 (SoMe-Test-Guide-261111pm.docx).
-- 1. Chats: a post carries its author's profile image (the round icon) and, for a comment on a
--    photo, that photo's thumbnail, so both show without another request.
-- 2. Ads: a card carries the author's profile image and the time of the ad's picture.
-- 3. Every photo says when it was uploaded as well as when it was taken in the app ("Taken in app"
--    or "Uploaded" + date and time, everywhere).
-- 4. Community settings: the labels of the three "profile states" (the sum columns of the member
--    list), which had no screen.
--
-- Live-safe (docs/prod-db-changes-steps-9-11.md): the same arguments everywhere, and results that
-- only gain columns or keys, which an older build ignores. The four functions that return a table
-- are dropped and created in this one transaction, since a new column changes their type.

-- ---------------------------------------------------------------------------------------------
-- 1. Chats (definitions from 20261022120000_post_actions.sql, plus author_icon and reply_photo).
-- author_icon is a path in the public profile bucket; reply_photo a path in the private bucket,
-- signed for the viewer like any chat picture (private_chat_photos_read).

create or replace function private.message_json(p_chat uuid, p_seq bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'seq', m.seq, 'author_id', m.author_id, 'author_name', a.username, 'author_status_id', a.status_id,
    'kind', m.kind, 'body', m.body, 'client_id', m.client_id, 'created_at', m.created_at, 'edited_at', m.edited_at,
    'reply_to_seq', m.reply_to_seq, 'reply_author', ra.username, 'reply_snippet', m.reply_snippet,
    'photo', case when p.id is not null then jsonb_build_object(
      'path', p.path, 'thumb_path', p.thumb_path, 'width', p.width, 'height', p.height, 'taken_in_app', p.taken_in_app, 'taken_at', p.taken_at
    ) end,
    'reactions', m.reactions, 'my_reaction', null, 'author_icon', ai.thumb_path, 'reply_photo', rp.thumb_path
  )
  from public.messages m
  join public.members a on a.community_id = m.community_id and a.user_id = m.author_id
  left join public.messages r on r.chat_id = m.chat_id and r.seq = m.reply_to_seq
  left join public.members ra on ra.community_id = r.community_id and ra.user_id = r.author_id
  left join public.photos p on p.id = m.photo_id
  left join public.photos ai on ai.id = a.photo_id
  left join public.photos rp on rp.id = r.photo_id
  where m.chat_id = p_chat and m.seq = p_seq
$$;

drop function public.list_messages(uuid, uuid, bigint, bigint, integer);

create function public.list_messages(p_community uuid, p_chat uuid, p_before bigint default null, p_after bigint default null, p_limit integer default 30)
returns table (
  seq bigint, author_id uuid, author_name text, author_status_id uuid, kind text, body text, client_id uuid, created_at timestamptz,
  edited_at timestamptz, reply_to_seq bigint, reply_author text, reply_snippet text, photo jsonb, reactions jsonb, my_reaction text,
  author_icon text, reply_photo text
)
language sql stable security definer set search_path = '' as $$
  select msg.seq, msg.author_id, a.username, a.status_id, msg.kind, msg.body, msg.client_id, msg.created_at,
    msg.edited_at, msg.reply_to_seq, ra.username, msg.reply_snippet,
    case when p.id is not null then jsonb_build_object(
      'path', p.path, 'thumb_path', p.thumb_path, 'width', p.width, 'height', p.height, 'taken_in_app', p.taken_in_app, 'taken_at', p.taken_at
    ) end,
    msg.reactions, mine.emoji, ai.thumb_path, rp.thumb_path
  from public.chat_members cm
  join public.members me on me.community_id = cm.community_id and me.user_id = cm.user_id and me.state in ('profile', 'applied', 'approved')
  cross join lateral (
    select m.seq, m.community_id, m.author_id, m.kind, m.body, m.client_id, m.created_at, m.edited_at,
      m.reply_to_seq, m.reply_snippet, m.photo_id, m.reactions
    from public.messages m
    where m.chat_id = cm.chat_id and m.seq > cm.visible_from_seq
      and (p_before is null or m.seq < p_before)
      and (p_after is null or m.seq > p_after)
    order by m.seq desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) as msg
  join public.members a on a.community_id = msg.community_id and a.user_id = msg.author_id
  left join public.messages r on r.chat_id = cm.chat_id and r.seq = msg.reply_to_seq
  left join public.members ra on ra.community_id = r.community_id and ra.user_id = r.author_id
  left join public.photos p on p.id = msg.photo_id
  left join public.photos ai on ai.id = a.photo_id
  left join public.photos rp on rp.id = r.photo_id
  left join public.reactions mine on mine.chat_id = cm.chat_id and mine.seq = msg.seq and mine.user_id = cm.user_id
  where cm.chat_id = p_chat and cm.user_id = (select auth.uid()) and cm.community_id = p_community
  order by msg.seq desc
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Ads (definitions from 20261030120000_ads.sql, plus author_icon and photo_at).

drop function public.search_ads(uuid, integer, timestamptz, uuid);

create function public.search_ads(p_community uuid, p_limit integer default 30, p_after_published timestamptz default null, p_after_id uuid default null)
returns table (
  id uuid, user_id uuid, username text, status_id uuid, ages integer[], score smallint, looking_for uuid[],
  headline text, district_id uuid, place text, published_at timestamptz,
  photo_path text, photo_thumb text, photo_taken_in_app boolean, stars smallint,
  author_icon text, photo_at timestamptz
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
    a.headline, a.district_id, a.place, a.published_at, p.path, p.thumb_path, p.taken_in_app, n.stars,
    ip.thumb_path, coalesce(p.taken_at, p.created_at)
  from page g
  join public.ads a on a.id = g.id
  join public.members m on m.community_id = p_community and m.user_id = a.user_id
  left join public.photos p on p.id = a.photo_id
  left join public.photos ip on ip.id = m.photo_id
  left join public.notes n on n.community_id = p_community and n.author_id = (select auth.uid()) and n.subject_id = a.user_id
  order by g.published_at desc, g.id desc
$$;

drop function public.member_ads(uuid, uuid);

create function public.member_ads(p_community uuid, p_user uuid)
returns table (
  id uuid, user_id uuid, username text, status_id uuid, ages integer[], score smallint, looking_for uuid[],
  headline text, district_id uuid, place text, published_at timestamptz,
  photo_path text, photo_thumb text, photo_taken_in_app boolean, stars smallint,
  author_icon text, photo_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id, m.username, m.status_id, private.member_ages(p_community, m.user_id, m.status_id), m.score, a.looking_for,
    a.headline, a.district_id, a.place, a.published_at, p.path, p.thumb_path, p.taken_in_app, n.stars,
    ip.thumb_path, coalesce(p.taken_at, p.created_at)
  from public.ads a
  join public.members m on m.community_id = p_community and m.user_id = a.user_id
  left join public.photos p on p.id = a.photo_id
  left join public.photos ip on ip.id = m.photo_id
  left join public.notes n on n.community_id = p_community and n.author_id = (select auth.uid()) and n.subject_id = a.user_id
  where (select private.can_see_ads(p_community, p_user))
    and a.community_id = p_community and a.user_id = p_user
  order by a.published_at desc, a.id desc
  limit 50
$$;

revoke execute on function
  public.list_messages(uuid, uuid, bigint, bigint, integer), public.search_ads(uuid, integer, timestamptz, uuid), public.member_ads(uuid, uuid)
  from public, anon;
grant execute on function
  public.list_messages(uuid, uuid, bigint, bigint, integer), public.search_ads(uuid, integer, timestamptz, uuid), public.member_ads(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. A photo's upload time next to its "taken in app" time. Every function that returns a photo as
-- JSON builds it with the same two keys; 'created_at' is added after them in place, so the rest of
-- each function stays exactly as it is (posts, ads, albums, applications).
do $$
declare
  v_old constant text := '''taken_in_app'', p.taken_in_app, ''taken_at'', p.taken_at';
  v_new constant text := '''taken_in_app'', p.taken_in_app, ''taken_at'', p.taken_at, ''created_at'', p.created_at';
  v_def text;
  v_count integer := 0;
begin
  for v_def in
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
      and strpos(p.prosrc, v_old) > 0 and strpos(p.prosrc, v_new) = 0
  loop
    execute replace(v_def, v_old, v_new);
    v_count := v_count + 1;
  end loop;
  if v_count < 4 then
    raise exception 'expected to add created_at to at least 4 functions, changed %', v_count;
  end if;
  raise notice 'created_at added to % functions', v_count;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Community settings: + state_labels, [3 texts] (optional, so an older build's save keeps the
-- labels as they are). An empty text clears a label; the member list then hides that column.
create or replace function public.save_community_settings(p_community uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_labels jsonb := p_settings -> 'state_labels';
begin
  perform private.require_community_admin(p_community);
  if jsonb_typeof(p_settings) is distinct from 'object'
    or jsonb_typeof(p_settings -> 'application_text') is distinct from 'string'
    or jsonb_typeof(p_settings -> 'require_app_image') is distinct from 'boolean'
    or jsonb_typeof(p_settings -> 'require_app_text') is distinct from 'boolean'
    or jsonb_typeof(p_settings -> 'require_app_names') is distinct from 'boolean'
    or jsonb_typeof(p_settings -> 'direct_join') is distinct from 'boolean' then
    raise exception 'settings are incomplete' using errcode = '22023';
  end if;
  if v_labels is not null and (
    jsonb_typeof(v_labels) is distinct from 'array' or jsonb_array_length(v_labels) <> 3
    or exists (select 1 from jsonb_array_elements(v_labels) as l where jsonb_typeof(l) is distinct from 'string' or char_length(btrim(l #>> '{}')) > 40)
  ) then
    raise exception 'state_labels is 3 texts of at most 40 characters' using errcode = '22023';
  end if;
  update public.communities
  set application_text = private.text_of(p_settings, 'application_text'),
      require_app_image = (p_settings ->> 'require_app_image')::boolean,
      require_app_text = (p_settings ->> 'require_app_text')::boolean,
      require_app_names = (p_settings ->> 'require_app_names')::boolean,
      direct_join = (p_settings ->> 'direct_join')::boolean,
      state_label_1 = case when v_labels is null then state_label_1 else nullif(btrim(v_labels ->> 0), '') end,
      state_label_2 = case when v_labels is null then state_label_2 else nullif(btrim(v_labels ->> 1), '') end,
      state_label_3 = case when v_labels is null then state_label_3 else nullif(btrim(v_labels ->> 2), '') end
  where id = p_community;
end
$$;
