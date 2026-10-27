-- Step 11: roster_members takes the last username of a page as it was shown and lower-cases it
-- here, with the same lower() as the order, so the phone never has to match Postgres's case rules
-- (a page could otherwise skip or repeat a name with unusual letters). Same result otherwise.

create or replace function public.roster_members(p_community uuid, p_chat uuid default null, p_query text default null, p_after text default null, p_limit integer default 50)
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
     and (p_after is null or lower(m.username) > lower(p_after))
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
     and (p_after is null or lower(m.username) > lower(p_after))
     and (nullif(btrim(p_query), '') is null
       or lower(m.username) like (select private.like_pattern(p_query))
       or lower(r.real_name_1) like (select private.like_pattern(p_query))
       or lower(r.real_name_2) like (select private.like_pattern(p_query)))
   order by lower(m.username)
   limit least(greatest(p_limit, 1), 100))
$$;
