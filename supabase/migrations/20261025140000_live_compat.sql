-- Keeps the live site working: the deployed build still calls profile_cards (Profiles list, swipe,
-- Ads, group "+") and group_directory (Find new), which 20261025120000_search.sql removed. Both come
-- back unchanged (their last versions: 20261020120000_blocks.sql, 20261021120000_groups.sql). The
-- new code uses search_profiles and find_new; these two are dropped once it is deployed
-- (docs/deferred-migrations.md).

create or replace function public.profile_cards(p_community uuid, p_limit integer default 30, p_after_score smallint default null, p_after_user uuid default null)
returns table (
  user_id uuid, username text, status_id uuid, country_id uuid, district_id uuid, place text, ages integer[], score smallint,
  looking_for uuid[], photo_thumb text, photo_taken_in_app boolean
)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.username, m.status_id, m.country_id, m.district_id, m.place,
    array(
      select extract(year from age(current_date, pp.birth_date))::integer
      from private.status_people(m.status_id) as s
      join public.profile_people pp
        on pp.community_id = m.community_id and pp.user_id = m.user_id
        and pp.substatus_id is not distinct from s.substatus_id and pp.n = s.n
      order by s.k
    ),
    m.score, m.looking_for, p.thumb_path, p.taken_in_app
  from public.members m
  join public.communities c on c.id = m.community_id
  left join public.photos p on p.id = m.photo_id
  where (select private.is_approved(p_community))
    and m.community_id = p_community and m.state = 'approved' and not m.is_system
    and (m.visible_in_search or not c.show_visibility)
    and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocker_id = (select auth.uid()) and b.blocked_id = m.user_id)
    and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocked_id = (select auth.uid()) and b.blocker_id = m.user_id)
    and (p_after_score is null or (m.score, m.user_id) < (p_after_score, p_after_user))
  order by m.score desc, m.user_id desc
  limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.group_directory(p_community uuid, p_limit integer default 50)
returns table (chat_id uuid, name text, headline text, direct_join boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.headline, c.direct_join
  from public.chats c
  where (select private.is_approved(p_community))
    and c.community_id = p_community and c.kind = 'group' and c.visible_in_search
    and not exists (select 1 from public.chat_members cm where cm.chat_id = c.id and cm.user_id = (select auth.uid()))
  order by lower(c.name)
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

revoke execute on function public.profile_cards(uuid, integer, smallint, uuid), public.group_directory(uuid, integer) from public, anon;
grant execute on function public.profile_cards(uuid, integer, smallint, uuid), public.group_directory(uuid, integer) to authenticated;
