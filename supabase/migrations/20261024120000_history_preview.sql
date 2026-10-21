-- Step 7 fix (browser test): with history off, A1 showed a member the group's last post from before
-- they joined. The preview and its time now show only when that post is one they can see; until
-- then the group shows with no preview at the time they joined.

create or replace function public.chat_list(p_community uuid, p_limit integer default 50)
returns table (
  chat_id uuid, kind text, name text, other_user_id uuid, other_icon text,
  preview text, last_message_at timestamptz, unread bigint
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, coalesce(c.name, o.username), o.user_id, p.thumb_path,
    case when c.last_seq > cm.visible_from_seq then c.last_message_preview end,
    case when c.last_seq > cm.visible_from_seq then coalesce(c.last_message_at, c.created_at) else greatest(cm.joined_at, c.created_at) end,
    greatest(c.last_seq - greatest(cm.last_read_seq, cm.visible_from_seq), 0)
  from public.members me
  join public.chat_members cm on cm.community_id = me.community_id and cm.user_id = me.user_id
  join public.chats c on c.id = cm.chat_id
  left join public.members o
    on c.kind = 'dm' and o.community_id = c.community_id
    and o.user_id = case when c.dm_user_a = me.user_id then c.dm_user_b else c.dm_user_a end
  left join public.photos p on p.id = o.photo_id
  where me.community_id = p_community and me.user_id = (select auth.uid()) and me.state = 'approved'
    and (c.kind = 'group' or c.last_seq > 0 or c.created_by = me.user_id)
  order by c.last_seq > greatest(cm.last_read_seq, cm.visible_from_seq) desc,
    case when c.last_seq > cm.visible_from_seq then coalesce(c.last_message_at, c.created_at) else greatest(cm.joined_at, c.created_at) end desc, c.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;
