-- A32 name search (member_names), faster: the matches are found through the trigram index
-- (members_username_trgm) first, then sorted. Before, the planner walked the whole community in name
-- order to stop at 20, testing every name against the text: ~8 ms for 5,000 members whatever was
-- typed. Same result and rules (blocks, approved members, never yourself).
create or replace function public.member_names(p_community uuid, p_query text, p_limit integer default 20)
returns table (user_id uuid, username text, icon text)
language sql stable security definer set search_path = '' as $$
  with found as materialized (
    select m.user_id, m.username, m.photo_id, m.state, m.is_system
    from public.members m
    where (select private.is_approved(p_community))
      and m.community_id = p_community
      and lower(m.username) like '%' || replace(replace(replace(lower(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  )
  select f.user_id, f.username, p.thumb_path
  from found f
  left join public.photos p on p.id = f.photo_id
  where f.state = 'approved' and not f.is_system
    and f.user_id <> (select auth.uid())
    and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocker_id = (select auth.uid()) and b.blocked_id = f.user_id)
    and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocked_id = (select auth.uid()) and b.blocker_id = f.user_id)
  order by lower(f.username)
  limit least(greatest(p_limit, 1), 50)
$$;
