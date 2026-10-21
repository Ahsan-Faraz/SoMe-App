-- Step 8: post actions and chat images (docs/backend-design.md D20, §4.7, §6.8, §7, §8).
-- A post can carry a photo (private bucket, signed links only for members who can see the post),
-- comment on another post (a snippet of it is copied at send; deleting a post deletes its comments),
-- be edited by its author (when the group allows editing) and deleted by its author or the group's
-- admins. One reaction per person per post, changeable, any emoji; the counts are kept on the post
-- by a trigger, so a page of 30 posts needs no counting. Group switches (commenting, reactions,
-- editing) are enforced here; the group's admins may always. Every change is broadcast on the chat's
-- channel: message, reaction, edited, removed.

-- ---------------------------------------------------------------------------------------------
-- Messages

alter table public.messages
  alter column body drop not null,
  add column photo_id uuid,
  add column reply_to_seq bigint, -- a comment on this post of the same chat
  add column reply_snippet text check (char_length(reply_snippet) <= 120), -- its text, copied at send
  add column reactions jsonb not null default '{}', -- {"👍": 3, "🙏": 1}, kept by the reactions trigger
  add column edited_at timestamptz,
  add constraint messages_body_or_photo check (body is not null or photo_id is not null),
  add constraint messages_photo_fk foreign key (community_id, photo_id) references public.photos (community_id, id),
  add constraint messages_reply_fk foreign key (chat_id, reply_to_seq) references public.messages (chat_id, seq) on delete cascade;

-- Deleting a post finds its comments (and their comments); the chat image's read check finds the post.
create index messages_replies on public.messages (chat_id, reply_to_seq) where reply_to_seq is not null;
create index messages_photo on public.messages (community_id, photo_id) where photo_id is not null;

alter table public.photos drop constraint photos_purpose_check;
alter table public.photos add constraint photos_purpose_check
  check (purpose in ('profile', 'album', 'chat', 'ad', 'application', 'identity'));

-- ---------------------------------------------------------------------------------------------
-- Reactions (D20)

create table public.reactions (
  chat_id uuid not null,
  seq bigint not null,
  community_id uuid not null,
  user_id uuid not null,
  -- Any emoji (the picker, or the phone's emoji keyboard): one grapheme of a few code points.
  emoji text not null check (char_length(emoji) between 1 and 16 and emoji !~ '[[:alnum:][:space:]]'),
  created_at timestamptz not null default now(),
  primary key (chat_id, seq, user_id), -- one per person per post; "Details" reads this prefix
  foreign key (chat_id, seq) references public.messages (chat_id, seq) on delete cascade,
  foreign key (community_id, user_id) references public.members on delete cascade
);

create index reactions_member on public.reactions (community_id, user_id);

alter table public.reactions enable row level security;
revoke all on public.reactions from anon, authenticated;

-- The counts on the post follow every change, cascades included. The post's row lock serialises two
-- reactions to the same post, so no count is lost.
create function private.count_reaction() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.messages
    set reactions = case
      when coalesce((reactions ->> old.emoji)::integer, 0) <= 1 then reactions - old.emoji
      else jsonb_set(reactions, array[old.emoji], to_jsonb((reactions ->> old.emoji)::integer - 1))
    end
    where chat_id = old.chat_id and seq = old.seq;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.messages
    set reactions = jsonb_set(reactions, array[new.emoji], to_jsonb(coalesce((reactions ->> new.emoji)::integer, 0) + 1))
    where chat_id = new.chat_id and seq = new.seq;
  end if;
  return null;
end
$$;

create trigger reactions_count_insert after insert on public.reactions for each row execute function private.count_reaction();
create trigger reactions_count_delete after delete on public.reactions for each row execute function private.count_reaction();
create trigger reactions_count_update after update of emoji on public.reactions
  for each row when (old.emoji is distinct from new.emoji) execute function private.count_reaction();

-- ---------------------------------------------------------------------------------------------
-- Helpers

-- The caller in this chat (an account that still has access), or no row.
create function private.chat_member_of(p_community uuid, p_chat uuid)
returns table (user_id uuid, username text, status_id uuid, state text, visible_from_seq bigint)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.username, m.status_id, m.state, cm.visible_from_seq
  from public.chat_members cm
  join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id and m.state in ('profile', 'applied', 'approved')
  where cm.chat_id = p_chat and cm.community_id = p_community and cm.user_id = (select auth.uid())
$$;

-- One post as screens and the channel show it (the same shape as list_messages' rows).
create function private.message_json(p_chat uuid, p_seq bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'seq', m.seq, 'author_id', m.author_id, 'author_name', a.username, 'author_status_id', a.status_id,
    'kind', m.kind, 'body', m.body, 'client_id', m.client_id, 'created_at', m.created_at, 'edited_at', m.edited_at,
    'reply_to_seq', m.reply_to_seq, 'reply_author', ra.username, 'reply_snippet', m.reply_snippet,
    'photo', case when p.id is not null then jsonb_build_object(
      'path', p.path, 'thumb_path', p.thumb_path, 'width', p.width, 'height', p.height, 'taken_in_app', p.taken_in_app, 'taken_at', p.taken_at
    ) end,
    'reactions', m.reactions, 'my_reaction', null
  )
  from public.messages m
  join public.members a on a.community_id = m.community_id and a.user_id = m.author_id
  left join public.messages r on r.chat_id = m.chat_id and r.seq = m.reply_to_seq
  left join public.members ra on ra.community_id = r.community_id and ra.user_id = r.author_id
  left join public.photos p on p.id = m.photo_id
  where m.chat_id = p_chat and m.seq = p_seq
$$;

-- The chat list's preview: the newest post, or nothing (after the newest was deleted or edited).
create function private.refresh_preview(p_chat uuid) returns void
language sql security definer set search_path = '' as $$
  update public.chats c
  set last_message_preview = (
    select left(
      case when c.kind = 'group' then a.username || ': ' else '' end
        || coalesce(regexp_replace(m.body, '\s+', ' ', 'g'), '📷 Photo'),
      160)
    from public.messages m
    join public.members a on a.community_id = m.community_id and a.user_id = m.author_id
    where m.chat_id = c.id
    order by m.seq desc
    limit 1
  )
  where c.id = p_chat
$$;

-- The photo rows of these posts, deleted (after the posts themselves); returns the files to delete
-- from Storage (both sizes), which the server does after the response.
create function private.drop_photos(p_ids uuid[]) returns text[]
language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.photos where id = any (p_ids) and purpose = 'chat'
    returning path, thumb_path
  )
  select coalesce(array_agg(x.path), '{}') from gone cross join lateral (values (gone.path), (gone.thumb_path)) as x (path)
$$;

-- Storage: may the caller read this chat image? Only a member of a chat with a post using it, who
-- can see that post (history off hides older ones). Used by the policy below, once per signed file.
create function private.can_read_chat_photo(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.photos p
    join public.messages m on m.community_id = p.community_id and m.photo_id = p.id
    join public.chat_members cm on cm.chat_id = m.chat_id and cm.user_id = (select auth.uid()) and m.seq > cm.visible_from_seq
    join public.members me on me.community_id = cm.community_id and me.user_id = cm.user_id and me.state in ('profile', 'applied', 'approved')
    where p.bucket = 'private' and p.purpose = 'chat' and (p.path = p_name or p.thumb_path = p_name)
  )
$$;

create policy private_chat_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'private' and private.can_read_chat_photo(name));

-- ---------------------------------------------------------------------------------------------
-- Sending (replaces send_message: + comments and photos)

drop function public.send_message(uuid, uuid, text, uuid);

-- A4 send. As before (the chat row is locked, so posts are numbered in order; a retry with the same
-- p_client_id returns the first send; blocks, posting, No-reply and applicants are checked), plus:
-- p_reply_to comments on that post (the group must allow commenting, admins may always), and
-- p_photo ({path, thumb_path, width, height, taken_in_app}, both files already in your folder of the
-- private bucket) attaches a photo. Text, a photo, or both. Returns {seq, created_at}.
create function public.send_message(
  p_community uuid, p_chat uuid, p_body text, p_client_id uuid default null, p_reply_to bigint default null, p_photo jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := nullif(regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g'), '');
  v_me record;
  v_chat public.chats;
  v_snippet text; -- the commented post's text, copied
  v_photo uuid;
  v_seq bigint;
  v_at timestamptz;
begin
  select * into v_me from private.chat_member_of(p_community, p_chat);
  if not found then
    raise exception 'you are not in this chat' using errcode = '42501';
  end if;
  if v_body is null and jsonb_typeof(p_photo) is distinct from 'object' then
    raise exception 'a message needs text or a photo' using errcode = '22023';
  end if;

  select * into v_chat from public.chats where id = p_chat for update;

  -- A retry of a send that went through (checked under the lock, so two retries can't both insert).
  if p_client_id is not null then
    select m.seq, m.created_at into v_seq, v_at from public.messages m where m.chat_id = p_chat and m.client_id = p_client_id;
    if found then
      return jsonb_build_object('seq', v_seq, 'created_at', v_at);
    end if;
  end if;

  if v_chat.kind = 'dm' and private.blocked_pair(p_community, v_chat.dm_user_a, v_chat.dm_user_b) then
    raise exception 'writing is blocked in this chat' using errcode = '42501';
  end if;
  if v_chat.kind = 'group' and not v_chat.allow_posting and not private.can_manage_group(p_community, p_chat) then
    raise exception 'posting is off in this group' using errcode = '42501';
  end if;
  if v_chat.kind = 'dm' and exists (
    select 1 from public.members s where s.community_id = p_community and s.is_system and s.user_id in (v_chat.dm_user_a, v_chat.dm_user_b)
  ) then
    raise exception 'the No-reply account can''t be answered' using errcode = '42501';
  end if;
  if v_me.state <> 'approved' and not (
    v_chat.kind = 'dm' and exists (
      select 1 from public.members adm
      where adm.community_id = p_community
        and adm.user_id = case when v_chat.dm_user_a = v_me.user_id then v_chat.dm_user_b else v_chat.dm_user_a end
        and adm.role = 'admin' and adm.state = 'approved'
        and exists (select 1 from public.messages m where m.chat_id = p_chat and m.author_id = adm.user_id)
    )
  ) then
    raise exception 'you can answer once the admin has written to you' using errcode = '42501';
  end if;

  if p_reply_to is not null then
    if v_chat.kind = 'group' and not v_chat.allow_commenting and not private.can_manage_group(p_community, p_chat) then
      raise exception 'commenting is off in this group' using errcode = '42501';
    end if;
    select left(coalesce(regexp_replace(m.body, '\s+', ' ', 'g'), '📷 Photo'), 120) into v_snippet
    from public.messages m where m.chat_id = p_chat and m.seq = p_reply_to and m.seq > v_me.visible_from_seq;
    if not found then
      raise exception 'no such post to comment on' using errcode = '22023';
    end if;
  end if;
  if jsonb_typeof(p_photo) = 'object' then
    v_photo := private.insert_photo(p_community, p_photo, 'private', 'chat');
  end if;

  v_at := now();
  update public.chats
  set last_seq = last_seq + 1,
      last_message_at = v_at,
      last_message_preview = left(
        case when kind = 'group' then v_me.username || ': ' else '' end || coalesce(regexp_replace(v_body, '\s+', ' ', 'g'), '📷 Photo'),
        160
      )
  where id = p_chat
  returning last_seq into v_seq;

  insert into public.messages (chat_id, seq, community_id, author_id, body, client_id, created_at, photo_id, reply_to_seq, reply_snippet)
  values (
    p_chat, v_seq, p_community, v_me.user_id, v_body, p_client_id, v_at, v_photo, p_reply_to, v_snippet
  );

  -- Your own message is read.
  update public.chat_members set last_read_seq = v_seq where chat_id = p_chat and user_id = v_me.user_id;

  perform realtime.send(private.message_json(p_chat, v_seq), 'message', 'chat:' || p_chat, true);
  return jsonb_build_object('seq', v_seq, 'created_at', v_at);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Reading (replaces list_messages: + photo, comment, reactions, edits)

drop function public.list_messages(uuid, uuid, bigint, bigint, integer);

-- A4 messages, newest first, as before (keyset on seq; history the caller may see), with each
-- post's photo (paths to sign), the post it comments on, the reaction counts, the caller's own
-- reaction and when it was edited. One query; the joins are primary-key lookups per row.
create function public.list_messages(p_community uuid, p_chat uuid, p_before bigint default null, p_after bigint default null, p_limit integer default 30)
returns table (
  seq bigint, author_id uuid, author_name text, author_status_id uuid, kind text, body text, client_id uuid, created_at timestamptz,
  edited_at timestamptz, reply_to_seq bigint, reply_author text, reply_snippet text, photo jsonb, reactions jsonb, my_reaction text
)
language sql stable security definer set search_path = '' as $$
  select msg.seq, msg.author_id, a.username, a.status_id, msg.kind, msg.body, msg.client_id, msg.created_at,
    msg.edited_at, msg.reply_to_seq, ra.username, msg.reply_snippet,
    case when p.id is not null then jsonb_build_object(
      'path', p.path, 'thumb_path', p.thumb_path, 'width', p.width, 'height', p.height, 'taken_in_app', p.taken_in_app, 'taken_at', p.taken_at
    ) end,
    msg.reactions, mine.emoji
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
  left join public.reactions mine on mine.chat_id = cm.chat_id and mine.seq = msg.seq and mine.user_id = cm.user_id
  where cm.chat_id = p_chat and cm.user_id = (select auth.uid()) and cm.community_id = p_community
  order by msg.seq desc
$$;

-- ---------------------------------------------------------------------------------------------
-- Post actions

-- B3 react: your one reaction on a post (D20), set to p_emoji or taken back (null). The group must
-- allow reactions (admins may always); not in a DM with a block. Broadcast with the new counts.
-- Returns the post's counts.
create function public.set_reaction(p_community uuid, p_chat uuid, p_seq bigint, p_emoji text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me record;
  v_chat public.chats;
  v_reactions jsonb;
begin
  select * into v_me from private.chat_member_of(p_community, p_chat);
  if not found then
    raise exception 'you are not in this chat' using errcode = '42501';
  end if;
  select * into v_chat from public.chats where id = p_chat;
  if v_chat.kind = 'group' and not v_chat.allow_reactions and not private.can_manage_group(p_community, p_chat) then
    raise exception 'reactions are off in this group' using errcode = '42501';
  end if;
  if v_chat.kind = 'dm' and private.blocked_pair(p_community, v_chat.dm_user_a, v_chat.dm_user_b) then
    raise exception 'writing is blocked in this chat' using errcode = '42501';
  end if;
  if not exists (select 1 from public.messages where chat_id = p_chat and seq = p_seq and seq > v_me.visible_from_seq and kind = 'user') then
    raise exception 'no such post' using errcode = '22023';
  end if;

  if p_emoji is null then
    delete from public.reactions where chat_id = p_chat and seq = p_seq and user_id = v_me.user_id;
  else
    insert into public.reactions (chat_id, seq, community_id, user_id, emoji)
    values (p_chat, p_seq, p_community, v_me.user_id, p_emoji)
    on conflict (chat_id, seq, user_id) do update set emoji = excluded.emoji;
  end if;

  select reactions into v_reactions from public.messages where chat_id = p_chat and seq = p_seq;
  perform realtime.send(
    jsonb_build_object('seq', p_seq, 'reactions', v_reactions, 'user_id', v_me.user_id, 'emoji', p_emoji),
    'reaction', 'chat:' || p_chat, true
  );
  return v_reactions;
end
$$;

-- B3 "Details": who reacted to a post, with what (the first 100 by name).
create function public.reaction_details(p_community uuid, p_chat uuid, p_seq bigint)
returns table (user_id uuid, username text, emoji text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.username, r.emoji
  from private.chat_member_of(p_community, p_chat) as me
  join public.messages post on post.chat_id = p_chat and post.seq = p_seq and post.seq > me.visible_from_seq
  join public.reactions r on r.chat_id = post.chat_id and r.seq = post.seq
  join public.members m on m.community_id = r.community_id and m.user_id = r.user_id
  order by lower(m.username)
  limit 100
$$;

-- B3 "Edit": your own post's text, when the group allows editing (its admins may always); not in a
-- DM with a block. Broadcast. A photo stays; a post with a photo may lose its text.
create function public.edit_message(p_community uuid, p_chat uuid, p_seq bigint, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := nullif(regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g'), '');
  v_me record;
  v_chat public.chats;
  v_msg public.messages;
begin
  select * into v_me from private.chat_member_of(p_community, p_chat);
  if not found then
    raise exception 'you are not in this chat' using errcode = '42501';
  end if;
  select * into v_chat from public.chats where id = p_chat;
  select * into v_msg from public.messages where chat_id = p_chat and seq = p_seq for update;
  if not found or v_msg.author_id <> v_me.user_id or v_msg.kind <> 'user' then
    raise exception 'only your own posts can be edited' using errcode = '42501';
  end if;
  if v_chat.kind = 'group' and not v_chat.allow_post_editing and not private.can_manage_group(p_community, p_chat) then
    raise exception 'editing is off in this group' using errcode = '42501';
  end if;
  if v_chat.kind = 'dm' and private.blocked_pair(p_community, v_chat.dm_user_a, v_chat.dm_user_b) then
    raise exception 'writing is blocked in this chat' using errcode = '42501';
  end if;
  if v_body is null and v_msg.photo_id is null then
    raise exception 'a message needs text or a photo' using errcode = '22023';
  end if;

  update public.messages set body = v_body, edited_at = now() where chat_id = p_chat and seq = p_seq;
  if p_seq = v_chat.last_seq then
    perform private.refresh_preview(p_chat);
  end if;
  perform realtime.send(
    jsonb_build_object('seq', p_seq, 'body', v_body, 'edited_at', now()),
    'edited', 'chat:' || p_chat, true
  );
end
$$;

-- B3/B5 "Delete": your own post, or any post in a group you run (group admin or community admin).
-- Its comments go with it (and theirs), reactions too. Broadcast with every removed number.
-- Returns {files}: their images in Storage, deleted by the server after the response.
create function public.delete_message(p_community uuid, p_chat uuid, p_seq bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me record;
  v_chat public.chats;
  v_author uuid;
  v_seqs bigint[];
  v_photos uuid[];
begin
  select * into v_me from private.chat_member_of(p_community, p_chat);
  if not found then
    raise exception 'you are not in this chat' using errcode = '42501';
  end if;
  select * into v_chat from public.chats where id = p_chat for update;
  select author_id into v_author from public.messages where chat_id = p_chat and seq = p_seq;
  if not found then
    raise exception 'no such post' using errcode = '22023';
  end if;
  if v_author <> v_me.user_id and not (v_chat.kind = 'group' and private.can_manage_group(p_community, p_chat)) then
    raise exception 'only your own posts, or as the group''s admin' using errcode = '42501';
  end if;

  -- The post and every comment under it.
  with recursive thread as (
    select m.seq, m.photo_id from public.messages m where m.chat_id = p_chat and m.seq = p_seq
    union all
    select m.seq, m.photo_id from public.messages m join thread t on m.chat_id = p_chat and m.reply_to_seq = t.seq
  )
  select array_agg(seq), array_agg(photo_id) filter (where photo_id is not null) into v_seqs, v_photos from thread;

  delete from public.messages where chat_id = p_chat and seq = p_seq;
  perform private.refresh_preview(p_chat);
  perform realtime.send(jsonb_build_object('seqs', to_jsonb(v_seqs)), 'removed', 'chat:' || p_chat, true);
  return jsonb_build_object('files', to_jsonb(private.drop_photos(coalesce(v_photos, '{}'))));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Leaving a DM and deleting a group also delete their chat images (as before, now returning
-- {files} for the server to delete from Storage)

drop function public.leave_chat(uuid, uuid, text);
create function public.leave_chat(p_community uuid, p_chat uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_chat public.chats;
  v_role text;
  v_other uuid;
  v_photos uuid[];
begin
  select cm.role into v_role
  from public.chat_members cm
  join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id and m.state = 'approved'
  where cm.chat_id = p_chat and cm.community_id = p_community and cm.user_id = v_uid;
  if not found then
    raise exception 'you are not in this chat' using errcode = '42501';
  end if;
  -- Locked, so a send in progress finishes first and a later one sees the block.
  select * into v_chat from public.chats where id = p_chat for update;

  if v_chat.kind = 'group' then
    if p_mode is distinct from 'leave' then
      raise exception 'unknown way to leave' using errcode = '22023';
    end if;
    if v_role = 'admin' then
      raise exception 'the group admin can''t leave their group' using errcode = '42501';
    end if;
    delete from public.chat_members where chat_id = p_chat and user_id = v_uid;
    return jsonb_build_object('files', '[]'::jsonb);
  end if;

  if p_mode is null or p_mode not in ('keep', 'delete') then
    raise exception 'unknown way to leave' using errcode = '22023';
  end if;
  v_other := case when v_chat.dm_user_a = v_uid then v_chat.dm_user_b else v_chat.dm_user_a end;

  insert into public.blocks (community_id, blocker_id, blocked_id) values (p_community, v_uid, v_other)
  on conflict do nothing;
  delete from public.profile_links
  where community_id = p_community
    and ((user_id = v_uid and linked_user_id = v_other) or (user_id = v_other and linked_user_id = v_uid));

  perform realtime.send(jsonb_build_object('mode', p_mode), case when p_mode = 'delete' then 'deleted' else 'blocked' end, 'chat:' || p_chat, true);
  if p_mode = 'delete' then
    select coalesce(array_agg(photo_id), '{}') into v_photos from public.messages where chat_id = p_chat and photo_id is not null;
    delete from public.chats where id = p_chat;
    return jsonb_build_object('files', to_jsonb(private.drop_photos(v_photos)));
  end if;
  return jsonb_build_object('files', '[]'::jsonb);
end
$$;

drop function public.delete_group(uuid, uuid);
create function public.delete_group(p_community uuid, p_chat uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_photos uuid[];
begin
  perform private.require_manage_group(p_community, p_chat);
  select coalesce(array_agg(photo_id), '{}') into v_photos from public.messages where chat_id = p_chat and photo_id is not null;
  delete from public.admin_records where scope_id = p_chat and community_id = p_community;
  delete from public.chats where id = p_chat;
  return jsonb_build_object('files', to_jsonb(private.drop_photos(v_photos)));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.count_reaction(), private.chat_member_of(uuid, uuid), private.message_json(uuid, bigint),
  private.refresh_preview(uuid), private.drop_photos(uuid[]) from public, anon, authenticated;
revoke execute on function private.can_read_chat_photo(text) from public, anon;
grant execute on function private.can_read_chat_photo(text) to authenticated; -- the storage policy runs as the caller

revoke execute on function
  public.send_message(uuid, uuid, text, uuid, bigint, jsonb), public.list_messages(uuid, uuid, bigint, bigint, integer),
  public.set_reaction(uuid, uuid, bigint, text), public.reaction_details(uuid, uuid, bigint),
  public.edit_message(uuid, uuid, bigint, text), public.delete_message(uuid, uuid, bigint),
  public.leave_chat(uuid, uuid, text), public.delete_group(uuid, uuid)
from public, anon;
grant execute on function
  public.send_message(uuid, uuid, text, uuid, bigint, jsonb), public.list_messages(uuid, uuid, bigint, bigint, integer),
  public.set_reaction(uuid, uuid, bigint, text), public.reaction_details(uuid, uuid, bigint),
  public.edit_message(uuid, uuid, bigint, text), public.delete_message(uuid, uuid, bigint),
  public.leave_chat(uuid, uuid, text), public.delete_group(uuid, uuid)
to authenticated;
