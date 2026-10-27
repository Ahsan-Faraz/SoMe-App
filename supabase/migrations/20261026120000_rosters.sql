-- Step 11: member lists, door list, statistics (docs/backend-design.md §6.11, §6.12). One list screen
-- for four uses (A30 group members, A31 community members, A20/A23 applications), now one page at a
-- time with the search in the database, so a community or group of any size lists, finds (a door
-- list at an event) and counts everyone. admin_roster and group_roster returned at most 2,000 rows
-- with the search and the statistics done on the phone over them: they stay for the deployed build
-- until this code is live (docs/prod-db-changes-steps-9-11.md). p_chat null = the community, else
-- that group. Only the community admin (community) or the group's admins (group) get rows.

-- ---------------------------------------------------------------------------------------------
-- A30/A31: members by name, 50 a page. A username is unique in its community (members_username_uq),
-- so the page key is the last lower(username). p_query matches the username or the scope's real names.
create function public.roster_members(p_community uuid, p_chat uuid default null, p_query text default null, p_after text default null, p_limit integer default 50)
returns table (
  user_id uuid, username text, status_id uuid, real_name_1 text, real_name_2 text,
  state_1 integer, state_2 integer, state_3 integer, notes text
)
language sql stable security definer set search_path = '' as $$
  (select m.user_id, m.username, m.status_id, r.real_name_1, r.real_name_2, r.state_1, r.state_2, r.state_3, r.notes
   from public.members m
   left join public.admin_records r on r.scope_id = p_community and r.user_id = m.user_id
   where p_chat is null and (select private.assert_community_admin(p_community))
     and m.community_id = p_community and m.state = 'approved' and not m.is_system
     and (p_after is null or lower(m.username) > p_after)
     and (nullif(btrim(p_query), '') is null
       or lower(m.username) like (select private.like_pattern(p_query))
       or lower(r.real_name_1) like (select private.like_pattern(p_query))
       or lower(r.real_name_2) like (select private.like_pattern(p_query)))
   order by lower(m.username)
   limit least(greatest(p_limit, 1), 100))
  union all
  (select m.user_id, m.username, m.status_id, r.real_name_1, r.real_name_2, r.state_1, r.state_2, r.state_3, r.notes
   from public.chat_members cm
   join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id and m.state = 'approved'
   left join public.admin_records r on r.scope_id = p_chat and r.user_id = cm.user_id
   where p_chat is not null and (select private.can_manage_group(p_community, p_chat))
     and cm.chat_id = p_chat and cm.community_id = p_community
     and (p_after is null or lower(m.username) > p_after)
     and (nullif(btrim(p_query), '') is null
       or lower(m.username) like (select private.like_pattern(p_query))
       or lower(r.real_name_1) like (select private.like_pattern(p_query))
       or lower(r.real_name_2) like (select private.like_pattern(p_query)))
   order by lower(m.username)
   limit least(greatest(p_limit, 1), 100))
$$;

-- A20/A23: open applications, oldest first, 50 a page (key: applied at, application id). Real names:
-- the admin's record, else what the application sent.
create function public.roster_applications(p_community uuid, p_chat uuid default null, p_query text default null,
  p_after_at timestamptz default null, p_after_id uuid default null, p_limit integer default 50)
returns table (
  application_id uuid, applied_at timestamptz, user_id uuid, username text, status_id uuid, message text,
  real_name_1 text, real_name_2 text, state_1 integer, state_2 integer, state_3 integer, notes text
)
language sql stable security definer set search_path = '' as $$
  (select a.id, a.created_at, m.user_id, m.username, m.status_id, a.message,
     coalesce(r.real_name_1, a.real_name_1), coalesce(r.real_name_2, a.real_name_2), r.state_1, r.state_2, r.state_3, r.notes
   from public.applications a
   join public.members m on m.community_id = a.community_id and m.user_id = a.user_id
   left join public.admin_records r on r.scope_id = p_community and r.user_id = a.user_id
   where p_chat is null and (select private.assert_community_admin(p_community))
     and a.community_id = p_community and a.chat_id is null and a.status in ('pending', 'later')
     and (p_after_at is null or (a.created_at, a.id) > (p_after_at, p_after_id))
     and (nullif(btrim(p_query), '') is null
       or lower(m.username) like (select private.like_pattern(p_query))
       or lower(coalesce(r.real_name_1, a.real_name_1)) like (select private.like_pattern(p_query))
       or lower(coalesce(r.real_name_2, a.real_name_2)) like (select private.like_pattern(p_query)))
   order by a.created_at, a.id
   limit least(greatest(p_limit, 1), 100))
  union all
  (select a.id, a.created_at, m.user_id, m.username, m.status_id, a.message,
     coalesce(r.real_name_1, a.real_name_1), coalesce(r.real_name_2, a.real_name_2), r.state_1, r.state_2, r.state_3, r.notes
   from public.applications a
   join public.members m on m.community_id = a.community_id and m.user_id = a.user_id and m.state = 'approved'
   left join public.admin_records r on r.scope_id = p_chat and r.user_id = a.user_id
   where p_chat is not null and (select private.can_manage_group(p_community, p_chat))
     and a.chat_id = p_chat and a.community_id = p_community and a.status in ('pending', 'later')
     and (p_after_at is null or (a.created_at, a.id) > (p_after_at, p_after_id))
     and (nullif(btrim(p_query), '') is null
       or lower(m.username) like (select private.like_pattern(p_query))
       or lower(coalesce(r.real_name_1, a.real_name_1)) like (select private.like_pattern(p_query))
       or lower(coalesce(r.real_name_2, a.real_name_2)) like (select private.like_pattern(p_query)))
   order by a.created_at, a.id
   limit least(greatest(p_limit, 1), 100))
$$;

-- The queues' page key (applied at, id). These replace the queue indexes on (…, created_at): same
-- rows, the id added to break ties, so the old ones go (nothing reads differently without them).
create index applications_queue_page on public.applications (community_id, created_at, id) where chat_id is null and status in ('pending', 'later');
create index applications_group_queue_page on public.applications (chat_id, created_at, id) where chat_id is not null and status in ('pending', 'later');
drop index public.applications_queue;
drop index public.applications_group_queue;

-- ---------------------------------------------------------------------------------------------
-- A28/A33: member count, count per Status and the sums of the 3 profile-state numbers, counted in
-- the database over the whole scope. Null when the caller doesn't run that group.
create function public.scope_stats(p_community uuid, p_chat uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with people as materialized (
    select m.user_id, m.status_id
    from public.members m
    where p_chat is null and (select private.assert_community_admin(p_community))
      and m.community_id = p_community and m.state = 'approved' and not m.is_system
    union all
    select m.user_id, m.status_id
    from public.chat_members cm
    join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id and m.state = 'approved'
    where p_chat is not null and (select private.can_manage_group(p_community, p_chat))
      and cm.chat_id = p_chat and cm.community_id = p_community
  )
  select jsonb_build_object(
    'members', (select count(*) from people),
    'by_status', coalesce((
      select jsonb_agg(jsonb_build_object('status_id', s.status_id, 'count', s.n) order by s.n desc, s.status_id)
      from (select status_id, count(*) as n from people group by status_id) as s
    ), '[]'),
    'sums', (
      select jsonb_build_array(coalesce(sum(r.state_1), 0), coalesce(sum(r.state_2), 0), coalesce(sum(r.state_3), 0))
      from people p
      join public.admin_records r on r.scope_id = coalesce(p_chat, p_community) and r.user_id = p.user_id
    )
  )
  where p_chat is null or (select private.can_manage_group(p_community, p_chat))
$$;

-- ---------------------------------------------------------------------------------------------
-- A30 "+": approved members not in the group yet, by name, 30 at most; blocks respected (as
-- member_names). Empty text = the first names in order.
create function public.group_candidates(p_community uuid, p_chat uuid, p_query text default null, p_limit integer default 30)
returns table (user_id uuid, username text, icon text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.username, p.thumb_path
  from public.members m
  left join public.photos p on p.id = m.photo_id
  where (select private.can_manage_group(p_community, p_chat))
    and m.community_id = p_community and m.state = 'approved' and not m.is_system
    and (nullif(btrim(p_query), '') is null or lower(m.username) like (select private.like_pattern(p_query)))
    and not exists (select 1 from public.chat_members cm where cm.chat_id = p_chat and cm.user_id = m.user_id)
    and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocker_id = (select auth.uid()) and b.blocked_id = m.user_id)
    and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocked_id = (select auth.uid()) and b.blocker_id = m.user_id)
  order by lower(m.username)
  limit least(greatest(p_limit, 1), 50)
$$;

-- ---------------------------------------------------------------------------------------------
-- find_new (step 9), faster for common text: the LIKE pattern is worked out once per call, not once
-- per row (inside a function the text is a parameter, so the planner can't fold it). Same result.

create or replace function public.find_new(p_community uuid, p_query text, p_users boolean default true, p_groups boolean default true, p_limit integer default 30)
returns table (kind text, id uuid, name text, status_id uuid, district_id uuid, place text, headline text, icon text)
language sql stable security definer set search_path = '' as $$
  with q as materialized (
    select v.user_id as viewer, c.show_visibility
    from public.members v
    join public.communities c on c.id = v.community_id
    where v.community_id = p_community and v.user_id = (select auth.uid()) and v.state = 'approved'
      and char_length(btrim(p_query)) between 2 and 80
  ),
  -- Ids already known, as one small hashed set: people in a block with you or in a DM with you, and
  -- your groups.
  known as materialized (
    select b.blocked_id as id from q join public.blocks b on b.community_id = p_community and b.blocker_id = q.viewer
    union all
    select b.blocker_id from q join public.blocks b on b.community_id = p_community and b.blocked_id = q.viewer
    union all
    select d.dm_user_b from q join public.chats d on d.community_id = p_community and d.kind = 'dm' and d.dm_user_a = q.viewer
    union all
    select d.dm_user_a from q join public.chats d on d.community_id = p_community and d.kind = 'dm' and d.dm_user_b = q.viewer
    union all
    select cm.chat_id from q join public.chat_members cm on cm.community_id = p_community and cm.user_id = q.viewer
  ),
  found as materialized (
    select 'user' as kind, m.user_id as id, m.username as name, m.photo_id, lower(m.username) as sort
    from q cross join public.members m
    where p_users and m.community_id = p_community
      and lower(m.username) like (select private.like_pattern(p_query))
      and m.state = 'approved' and not m.is_system and m.user_id <> q.viewer
      and (m.visible_in_search or not q.show_visibility)
      and m.user_id not in (select id from known)
    union all
    select 'group', g.id, g.name, null, lower(g.name)
    from q cross join public.chats g
    where p_groups and g.community_id = p_community and g.kind = 'group'
      and lower(g.name) like (select private.like_pattern(p_query))
      and g.visible_in_search
      and g.id not in (select id from known)
    order by sort, id
    limit least(greatest(p_limit, 1), 50)
  )
  select f.kind, f.id, f.name, m.status_id, m.district_id, m.place, g.headline, p.thumb_path
  from found f
  left join public.members m on f.kind = 'user' and m.community_id = p_community and m.user_id = f.id
  left join public.photos p on p.id = f.photo_id
  left join public.chats g on f.kind = 'group' and g.id = f.id
  order by f.sort, f.id
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function
  public.roster_members(uuid, uuid, text, text, integer),
  public.roster_applications(uuid, uuid, text, timestamptz, uuid, integer),
  public.scope_stats(uuid, uuid),
  public.group_candidates(uuid, uuid, text, integer)
from public, anon;
grant execute on function
  public.roster_members(uuid, uuid, text, text, integer),
  public.roster_applications(uuid, uuid, text, timestamptz, uuid, integer),
  public.scope_stats(uuid, uuid),
  public.group_candidates(uuid, uuid, text, integer)
to authenticated;
