-- Step 5: chats (core) and live messages (docs/backend-design.md §4.7, §6.7, §6.8, §8).
-- A DM and a group are both a chat. Messages are numbered per chat (seq 1, 2, 3…): paging is a
-- keyset on seq and unread is a subtraction (last_seq − last_read_seq), never a count.
-- Clients read and write nothing here directly: every read and write is an RPC below that checks
-- the caller's chat membership and the community. Sending also broadcasts the message on the
-- chat's private Realtime channel (`chat:{id}`), in the same transaction; joining that channel is
-- allowed for chat members only (policy on realtime.messages).
-- DMs are found or created here (open_dm) so chats exist to send in; blocks and leaving a DM are
-- step 6, group creation and group settings (posting, history…) step 7, reactions, comments,
-- edits and images step 8.

-- ---------------------------------------------------------------------------------------------
-- Tables

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities on delete cascade,
  kind text not null check (kind in ('dm', 'group')),
  name text check (char_length(name) between 1 and 80 and name = btrim(name)), -- groups (NAME_MAX)
  dm_user_a uuid, -- DMs: the two people, a < b, so one pair has one DM
  dm_user_b uuid,
  -- List bookkeeping, kept by send_message under the chat's row lock.
  last_seq bigint not null default 0 check (last_seq >= 0),
  last_message_at timestamptz,
  last_message_preview text check (char_length(last_message_preview) <= 160),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (community_id, id), -- child tables carry the community and point at both
  check ((kind = 'dm') = (dm_user_a is not null and dm_user_b is not null and dm_user_a < dm_user_b)),
  check ((kind = 'group') = (name is not null)),
  foreign key (community_id, dm_user_a) references public.members on delete cascade,
  foreign key (community_id, dm_user_b) references public.members on delete cascade
);

-- One DM per pair (open_dm, find_dm); dm_user_b's own index serves the member cascade.
create unique index chats_dm on public.chats (community_id, dm_user_a, dm_user_b) where kind = 'dm';
create index chats_dm_b on public.chats (community_id, dm_user_b) where kind = 'dm';

create table public.chat_members (
  chat_id uuid not null,
  community_id uuid not null,
  user_id uuid not null,
  role text not null default 'member' check (role in ('member', 'admin')), -- group admin (step 7)
  last_read_seq bigint not null default 0 check (last_read_seq >= 0),
  visible_from_seq bigint not null default 0 check (visible_from_seq >= 0), -- history off (step 7)
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id),
  foreign key (community_id, chat_id) references public.chats (community_id, id) on delete cascade,
  foreign key (community_id, user_id) references public.members on delete cascade
);

-- A1: the caller's chats in one community, with what unread needs, from the index alone.
create index chat_members_user on public.chat_members (community_id, user_id) include (chat_id, last_read_seq, visible_from_seq);
-- D10: one admin per group; drop to allow co-admins.
create unique index chat_one_admin on public.chat_members (chat_id) where role = 'admin';

create table public.messages (
  chat_id uuid not null,
  seq bigint not null check (seq > 0),
  community_id uuid not null,
  author_id uuid not null,
  kind text not null default 'user' check (kind in ('user', 'system')),
  -- Trimmed (spaces and line breaks) at send; MESSAGE_MAX.
  body text not null check (char_length(body) between 1 and 8000 and body !~ '^\s' and body !~ '\s$'),
  client_id uuid, -- made on the phone: a retried send is saved once, and the sender matches the echo
  created_at timestamptz not null default now(),
  primary key (chat_id, seq), -- A4 paging: newest first, keyset on seq
  foreign key (community_id, chat_id) references public.chats (community_id, id) on delete cascade,
  foreign key (community_id, author_id) references public.members on delete cascade
);

create unique index messages_client on public.messages (chat_id, client_id) where client_id is not null;
-- The cascade when a member account is deleted (step 15).
create index messages_author on public.messages (community_id, author_id);

-- ---------------------------------------------------------------------------------------------
-- Security: no direct reads or writes for clients; the RPCs below are the only way in.

alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
revoke all on public.chats, public.chat_members, public.messages from anon, authenticated;

-- Is the caller in this chat, with an account that still has access (applicants included: their
-- DM with the admin)? Removed and rejected accounts lose every chat at once.
create function private.is_chat_member(p_chat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.chat_members cm
    join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id
    where cm.chat_id = p_chat and cm.user_id = (select auth.uid()) and m.state in ('profile', 'applied', 'approved')
  )
$$;

-- Is the caller this group's admin (step 7 gives groups their admin)?
create function private.is_group_admin(p_chat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.chat_members cm
    join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id
    join public.chats c on c.id = cm.chat_id
    where cm.chat_id = p_chat and cm.user_id = (select auth.uid()) and cm.role = 'admin'
      and c.kind = 'group' and m.state = 'approved'
  )
$$;

-- Realtime: may the caller listen on this topic? Only `chat:{uuid}` of a chat they are in. The
-- case keeps a malformed topic from ever reaching the uuid cast.
create function private.can_listen(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_topic ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_chat_member(substr(p_topic, 6)::uuid)
    else false
  end
$$;

-- Checked once, when a phone joins the channel (not per message). Clients may only listen:
-- with no insert policy, only send_message (in the database) broadcasts.
create policy chat_members_listen on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select private.can_listen((select realtime.topic()))));

-- ---------------------------------------------------------------------------------------------
-- Reads. Plain SQL: one query each, so the planner can use the indexes end to end.

-- A1: the caller's chats, unread first, then newest activity. Unread = last_seq minus what they
-- have read (or could never see: history off), no counting. A DM shows once it has a message, or
-- to the person who opened it. Name and icon of a DM are the other person's. Approved members only.
-- perf: the first 50 (the list searches them on the phone); keyset paging when someone has more.
create function public.chat_list(p_community uuid, p_limit integer default 50)
returns table (
  chat_id uuid, kind text, name text, other_user_id uuid, other_icon text,
  preview text, last_message_at timestamptz, unread bigint
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, coalesce(c.name, o.username), o.user_id, p.thumb_path,
    c.last_message_preview, coalesce(c.last_message_at, c.created_at),
    greatest(c.last_seq - greatest(cm.last_read_seq, cm.visible_from_seq), 0)
  from public.members me
  join public.chat_members cm on cm.community_id = me.community_id and cm.user_id = me.user_id
  join public.chats c on c.id = cm.chat_id
  left join public.members o
    on c.kind = 'dm' and o.community_id = c.community_id
    and o.user_id = case when c.dm_user_a = me.user_id then c.dm_user_b else c.dm_user_a end
  left join public.photos p on p.id = o.photo_id
  where me.community_id = p_community and me.user_id = (select auth.uid()) and me.state = 'approved'
    and (c.last_seq > 0 or c.created_by = me.user_id)
  order by c.last_seq > greatest(cm.last_read_seq, cm.visible_from_seq) desc, coalesce(c.last_message_at, c.created_at) desc, c.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- A4 header: the chat as the caller sees it, or no row when they are not in it (or it is not in
-- this community). A DM's name is the other person's username.
create function public.chat_header(p_community uuid, p_chat uuid)
returns table (chat_id uuid, kind text, name text, other_user_id uuid, my_role text, last_seq bigint, last_read_seq bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, coalesce(c.name, o.username), o.user_id, cm.role, c.last_seq, cm.last_read_seq
  from public.chat_members cm
  join public.members me on me.community_id = cm.community_id and me.user_id = cm.user_id and me.state in ('profile', 'applied', 'approved')
  join public.chats c on c.id = cm.chat_id
  left join public.members o
    on c.kind = 'dm' and o.community_id = c.community_id
    and o.user_id = case when c.dm_user_a = cm.user_id then c.dm_user_b else c.dm_user_a end
  where cm.chat_id = p_chat and cm.user_id = (select auth.uid()) and cm.community_id = p_community
$$;

-- A4 messages, newest first, from the chat's history the caller may see (seq > visible_from_seq).
-- Older page: p_before = the oldest seq on screen. Catching up after a reconnect: p_after = the
-- newest seq on screen (a full page back means there may be a gap: reload the newest instead).
-- Author name and Status are read live (usernames never change, D19). Nothing for non-members.
create function public.list_messages(p_community uuid, p_chat uuid, p_before bigint default null, p_after bigint default null, p_limit integer default 30)
returns table (seq bigint, author_id uuid, author_name text, author_status_id uuid, kind text, body text, client_id uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select msg.seq, msg.author_id, a.username, a.status_id, msg.kind, msg.body, msg.client_id, msg.created_at
  from public.chat_members cm
  join public.members me on me.community_id = cm.community_id and me.user_id = cm.user_id and me.state in ('profile', 'applied', 'approved')
  cross join lateral (
    select m.seq, m.community_id, m.author_id, m.kind, m.body, m.client_id, m.created_at
    from public.messages m
    where m.chat_id = cm.chat_id and m.seq > cm.visible_from_seq
      and (p_before is null or m.seq < p_before)
      and (p_after is null or m.seq > p_after)
    order by m.seq desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) as msg
  join public.members a on a.community_id = msg.community_id and a.user_id = msg.author_id
  where cm.chat_id = p_chat and cm.user_id = (select auth.uid()) and cm.community_id = p_community
  order by msg.seq desc
$$;

-- B2 "DM" button: the caller's DM with this person, if there is one (else null).
create function public.find_dm(p_community uuid, p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id
  from public.chats c
  where c.community_id = p_community and c.kind = 'dm'
    and c.dm_user_a = least((select auth.uid()), p_user) and c.dm_user_b = greatest((select auth.uid()), p_user)
    and (select private.is_member(p_community))
$$;

-- A25 "Chat with admin": an applicant's DM with a community admin, only once that admin has
-- written in it. Null otherwise (no button at all).
create function public.admin_chat(p_community uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id
  from public.members me
  join public.chat_members cm on cm.community_id = me.community_id and cm.user_id = me.user_id
  join public.chats c on c.id = cm.chat_id and c.kind = 'dm'
  join public.members adm
    on adm.community_id = c.community_id
    and adm.user_id = case when c.dm_user_a = me.user_id then c.dm_user_b else c.dm_user_a end
    and adm.role = 'admin' and adm.state = 'approved'
  where me.community_id = p_community and me.user_id = (select auth.uid()) and me.state in ('profile', 'applied')
    and exists (select 1 from public.messages m where m.chat_id = c.id and m.author_id = adm.user_id)
  order by c.last_message_at desc nulls last
  limit 1
$$;

-- ---------------------------------------------------------------------------------------------
-- Writes (hot ones straight from the phone: send, mark read).

-- B2/A21 "DM": find or create the DM with another member. Approved members DM approved members;
-- the community admin may also DM an applicant (A25: they can answer once the admin has written).
-- Blocks are checked here from step 6. Two people opening the same DM at once get the same chat.
create function public.open_dm(p_community uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.members;
  v_other public.members;
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  select * into v_me from public.members
  where community_id = p_community and user_id = (select auth.uid()) and state = 'approved' and not is_system;
  if not found then
    raise exception 'only members can start a DM' using errcode = '42501';
  end if;
  select * into v_other from public.members
  where community_id = p_community and user_id = p_user and not is_system;
  if not found or p_user = v_me.user_id
    or not (v_other.state = 'approved' or (v_other.state in ('profile', 'applied') and v_me.role = 'admin')) then
    raise exception 'you cannot start a DM with this person' using errcode = '22023';
  end if;

  v_a := least(v_me.user_id, p_user);
  v_b := greatest(v_me.user_id, p_user);
  insert into public.chats (community_id, kind, dm_user_a, dm_user_b, created_by)
  values (p_community, 'dm', v_a, v_b, v_me.user_id)
  on conflict (community_id, dm_user_a, dm_user_b) where kind = 'dm' do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.chats
    where community_id = p_community and kind = 'dm' and dm_user_a = v_a and dm_user_b = v_b;
    return v_id;
  end if;
  insert into public.chat_members (chat_id, community_id, user_id)
  values (v_id, p_community, v_a), (v_id, p_community, v_b);
  return v_id;
end
$$;

-- A4 send. The chat row is locked, so messages get numbers in order; the message is broadcast to
-- the open chat in the same transaction (nothing goes out if it fails). An applicant may only
-- answer in a DM where a community admin has written first. A retry with the same p_client_id
-- returns the first send instead of saving it twice. Returns {seq, created_at}.
-- Group rules (posting off, history) arrive with groups in step 7; blocks in step 6.
create function public.send_message(p_community uuid, p_chat uuid, p_body text, p_client_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
  v_me public.members;
  v_chat public.chats;
  v_seq bigint;
  v_at timestamptz;
begin
  select m.* into v_me
  from public.chat_members cm
  join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id
  where cm.chat_id = p_chat and cm.community_id = p_community and cm.user_id = (select auth.uid())
    and m.state in ('profile', 'applied', 'approved');
  if not found then
    raise exception 'you are not in this chat' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'a message needs text' using errcode = '22023';
  end if;

  select * into v_chat from public.chats where id = p_chat for update;

  -- A retry of a send that went through (checked under the lock, so two retries can't both insert).
  if p_client_id is not null then
    select m.seq, m.created_at into v_seq, v_at from public.messages m where m.chat_id = p_chat and m.client_id = p_client_id;
    if found then
      return jsonb_build_object('seq', v_seq, 'created_at', v_at);
    end if;
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

  v_at := now();
  update public.chats
  set last_seq = last_seq + 1,
      last_message_at = v_at,
      last_message_preview = left(
        case when kind = 'group' then v_me.username || ': ' else '' end || regexp_replace(v_body, '\s+', ' ', 'g'),
        160
      )
  where id = p_chat
  returning last_seq into v_seq;

  insert into public.messages (chat_id, seq, community_id, author_id, body, client_id, created_at)
  values (p_chat, v_seq, p_community, v_me.user_id, v_body, p_client_id, v_at);

  -- Your own message is read.
  update public.chat_members set last_read_seq = v_seq where chat_id = p_chat and user_id = v_me.user_id;

  perform realtime.send(
    jsonb_build_object(
      'seq', v_seq, 'author_id', v_me.user_id, 'author_name', v_me.username, 'author_status_id', v_me.status_id,
      'kind', 'user', 'body', v_body, 'client_id', p_client_id, 'created_at', v_at
    ),
    'message', 'chat:' || p_chat, true
  );
  return jsonb_build_object('seq', v_seq, 'created_at', v_at);
end
$$;

-- A4: read up to p_seq (on opening the chat and on leaving it, never per message). Never moves
-- back, never past the last message. Only your own marker.
create function public.mark_read(p_community uuid, p_chat uuid, p_seq bigint) returns void
language sql security definer set search_path = '' as $$
  update public.chat_members cm
  set last_read_seq = least(p_seq, c.last_seq)
  from public.chats c
  where cm.chat_id = p_chat and cm.community_id = p_community and cm.user_id = (select auth.uid())
    and c.id = cm.chat_id and least(p_seq, c.last_seq) > cm.last_read_seq
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.is_chat_member(uuid), private.is_group_admin(uuid), private.can_listen(text) from public, anon;
grant execute on function private.can_listen(text) to authenticated; -- the realtime.messages policy runs as the caller

revoke execute on function
  public.chat_list(uuid, integer), public.chat_header(uuid, uuid), public.list_messages(uuid, uuid, bigint, bigint, integer),
  public.find_dm(uuid, uuid), public.admin_chat(uuid), public.open_dm(uuid, uuid),
  public.send_message(uuid, uuid, text, uuid), public.mark_read(uuid, uuid, bigint)
from public, anon;
grant execute on function
  public.chat_list(uuid, integer), public.chat_header(uuid, uuid), public.list_messages(uuid, uuid, bigint, bigint, integer),
  public.find_dm(uuid, uuid), public.admin_chat(uuid), public.open_dm(uuid, uuid),
  public.send_message(uuid, uuid, text, uuid), public.mark_read(uuid, uuid, bigint)
to authenticated;
