-- Step 7 follow-up: the community admin picks a group's admin on F1 "Add to groups" (set_group_admin
-- had no screen). group_assignments also says which group this member runs ('admin'). Same arguments
-- and result shape; the extra key is ignored by the deployed build.

create or replace function public.group_assignments(p_community uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'can_create_groups', case when (select private.is_community_admin(p_community)) then (
      select can_create_groups from public.members where community_id = p_community and user_id = p_user
    ) end,
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name,
        'member', t.user_id is not null,
        'admin', coalesce(t.role = 'admin', false)
      ) order by lower(c.name))
      from public.chats c
      left join public.chat_members t on t.chat_id = c.id and t.user_id = p_user
      where c.community_id = p_community and c.kind = 'group'
        and ((select private.is_community_admin(p_community)) or private.is_group_admin(c.id))
    ), '[]')
  )
  where (select private.is_approved(p_community))
$$;
