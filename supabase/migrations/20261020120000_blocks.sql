-- Step 6: DMs and blocking (docs/backend-design.md D12, D13, §6.9).
-- A block is personal: one member blocks another in one community. It stops writing in their DM
-- (both ways), refuses a new DM, and hides the two from each other: profile, Profiles list, name
-- search and linked profiles (the community admin still sees everyone). Search and ads (steps 9,
-- 14) add the same check. Leaving a DM: "Keep chat, block writing" keeps it for both, read only;
-- "Delete chat, block user" deletes it for both. Leaving a group removes your own membership.
-- Unblocking is not in the spec yet.

-- ---------------------------------------------------------------------------------------------
-- Blocks

create table public.blocks (
  community_id uuid not null,
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (community_id, blocker_id, blocked_id), -- "did I block them"
  check (blocker_id <> blocked_id),
  foreign key (community_id, blocker_id) references public.members on delete cascade,
  foreign key (community_id, blocked_id) references public.members on delete cascade
);

-- "Did they block me", and the cascade from the blocked member.
create index blocks_blocked on public.blocks (community_id, blocked_id);

-- Your own blocks are readable (a later "blocked people" list); nobody reads who blocked them.
-- Written only by leave_chat.
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;

create policy blocks_read_own on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

-- Has either of the two blocked the other? Two primary-key lookups.
create function private.blocked_pair(p_community uuid, p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where community_id = p_community
      and ((blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a))
  )
$$;

-- ---------------------------------------------------------------------------------------------
-- Leaving a chat

-- G1/A4 "Leave". A DM: p_mode 'keep' (block writing, the chat stays for both) or 'delete' (the chat
-- and its messages are deleted for both); either way the other person is blocked and the profile
-- links between the two are removed. The other person's open chat is told at once. A group:
-- p_mode 'leave' removes your membership (the group admin can't leave their group).
create function public.leave_chat(p_community uuid, p_chat uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_chat public.chats;
  v_role text;
  v_other uuid;
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
    return;
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
    delete from public.chats where id = p_chat;
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Blocks everywhere the two meet (unchanged otherwise)

create or replace function public.profile(p_community uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_viewer public.members;
  v_member public.members;
  v_own boolean := p_user = v_uid;
  v_admin boolean;
begin
  select * into v_viewer from public.members
  where community_id = p_community and user_id = v_uid and state in ('profile', 'applied', 'approved');
  if not found then
    return null;
  end if;
  v_admin := v_viewer.state = 'approved' and v_viewer.role = 'admin';

  select * into v_member from public.members
  where community_id = p_community and user_id = p_user and not is_system;
  if not found or not (v_own or v_admin or (v_viewer.state = 'approved' and v_member.state = 'approved')) then
    return null;
  end if;
  -- A block hides the two people from each other (D13); the community admin still sees everyone.
  if not v_own and not v_admin and private.blocked_pair(p_community, v_uid, p_user) then
    return null;
  end if;

  return jsonb_build_object(
    'user_id', v_member.user_id,
    'username', v_member.username,
    'state', v_member.state,
    'own', v_own,
    'created_at', case when v_own or v_admin then v_member.created_at end,
    'status_id', v_member.status_id,
    'looking_for', to_jsonb(v_member.looking_for),
    'country_id', v_member.country_id,
    'district_id', v_member.district_id,
    'place', v_member.place,
    'visible_in_search', v_member.visible_in_search,
    'score', v_member.score,
    'last_login_at', v_member.last_login_at,
    'photo', (select private.photo_json(p) from public.photos p where p.id = v_member.photo_id),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'substatus_id', s.substatus_id, 'n', s.n,
        'birth_date', case when v_own then pp.birth_date end,
        'age', extract(year from age(current_date, pp.birth_date))::integer
      ) order by s.k)
      from private.status_people(v_member.status_id) as s
      left join public.profile_people pp
        on pp.community_id = p_community and pp.user_id = p_user
        and pp.substatus_id is not distinct from s.substatus_id and pp.n = s.n
    ), '[]'),
    'values', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', v.field_id, 'substatus_id', v.substatus_id, 'n', v.n, 'text', v.value_text, 'num', v.value_num,
        'bool', v.value_bool, 'date', v.value_date, 'photo', private.photo_json(p)
      ))
      from public.profile_values v
      join public.profile_fields f on f.id = v.field_id
      left join public.photos p on p.id = v.value_photo_id
      where v.community_id = p_community and v.user_id = p_user
        and private.field_applies(f, v_member.status_id, v.substatus_id, v.n)
    ), '[]'),
    'choices', coalesce((
      select jsonb_agg(jsonb_build_object('field_id', c.field_id, 'substatus_id', c.substatus_id, 'n', c.n, 'option_ids', c.option_ids))
      from (
        select v.field_id, v.substatus_id, v.n, array_agg(v.option_id order by o.position) as option_ids
        from public.profile_value_options v
        join public.profile_fields f on f.id = v.field_id
        join public.profile_field_options o on o.id = v.option_id
        where v.community_id = p_community and v.user_id = p_user
          and private.field_applies(f, v_member.status_id, v.substatus_id, v.n)
        group by v.field_id, v.substatus_id, v.n
      ) as c
    ), '[]'),
    -- Your own: every link you made, confirmed or not. Someone else's: confirmed links only.
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'username', m.username, 'icon', p.thumb_path, 'confirmed', back.user_id is not null, 'comment', l.comment
      ) order by l.created_at)
      from public.profile_links l
      join public.members m on m.community_id = l.community_id and m.user_id = l.linked_user_id and m.state = 'approved'
      left join public.photos p on p.id = m.photo_id
      left join public.profile_links back
        on back.community_id = l.community_id and back.user_id = l.linked_user_id and back.linked_user_id = l.user_id
      where l.community_id = p_community and l.user_id = p_user and (v_own or back.user_id is not null)
        and (v_admin or not private.blocked_pair(p_community, v_uid, m.user_id))
    ), '[]'),
    -- Your own only: who has linked to you, so you can link back.
    'linked_you', case when v_own then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', m.username, 'icon', p.thumb_path) order by l.created_at)
      from public.profile_links l
      join public.members m on m.community_id = l.community_id and m.user_id = l.user_id and m.state = 'approved'
      left join public.photos p on p.id = m.photo_id
      where l.community_id = p_community and l.linked_user_id = p_user
        and not private.blocked_pair(p_community, v_uid, m.user_id)
    ), '[]') else '[]'::jsonb end
  );
end
$$;

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

create or replace function public.member_names(p_community uuid, p_query text, p_limit integer default 20)
returns table (user_id uuid, username text, icon text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.username, p.thumb_path
  from public.members m
  left join public.photos p on p.id = m.photo_id
  where (select private.is_approved(p_community))
    and m.community_id = p_community and m.state = 'approved' and not m.is_system
    and m.user_id <> (select auth.uid())
    and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocker_id = (select auth.uid()) and b.blocked_id = m.user_id)
    and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocked_id = (select auth.uid()) and b.blocker_id = m.user_id)
    and lower(m.username) like '%' || replace(replace(replace(lower(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by lower(m.username)
  limit least(greatest(p_limit, 1), 50)
$$;

create or replace function public.set_profile_link(p_community uuid, p_linked uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
begin
  if not p_on then
    delete from public.profile_links
    where community_id = p_community and user_id = v_member.user_id and linked_user_id = p_linked;
    return;
  end if;

  if v_member.state <> 'approved' or not (select show_links from public.communities where id = p_community) then
    raise exception 'linking profiles is not open to you here' using errcode = '42501';
  end if;
  if p_linked = v_member.user_id or private.blocked_pair(p_community, v_member.user_id, p_linked) or not exists (
    select 1 from public.members
    where community_id = p_community and user_id = p_linked and state = 'approved' and not is_system
  ) then
    raise exception 'no such member' using errcode = '22023';
  end if;

  insert into public.profile_links (community_id, user_id, linked_user_id)
  values (p_community, v_member.user_id, p_linked)
  on conflict do nothing;

  -- The member row is locked, so two adds can't both pass this count.
  if (select count(*) from public.profile_links where community_id = p_community and user_id = v_member.user_id) > 3 then
    raise exception 'at most 3 linked profiles' using errcode = '23514';
  end if;
end
$$;

create or replace function public.open_dm(p_community uuid, p_user uuid) returns uuid
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
  if private.blocked_pair(p_community, v_me.user_id, p_user) then
    raise exception 'one of you has blocked the other' using errcode = '42501';
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

create or replace function public.send_message(p_community uuid, p_chat uuid, p_body text, p_client_id uuid default null) returns jsonb
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

  if v_chat.kind = 'dm' and private.blocked_pair(p_community, v_chat.dm_user_a, v_chat.dm_user_b) then
    raise exception 'writing is blocked in this chat' using errcode = '42501';
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

-- A4 header: + blocked, so the screen shows "Writing is blocked in this chat." instead of the box.
drop function public.chat_header(uuid, uuid);
create function public.chat_header(p_community uuid, p_chat uuid)
returns table (chat_id uuid, kind text, name text, other_user_id uuid, my_role text, last_seq bigint, last_read_seq bigint, blocked boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, coalesce(c.name, o.username), o.user_id, cm.role, c.last_seq, cm.last_read_seq,
    c.kind = 'dm' and private.blocked_pair(c.community_id, c.dm_user_a, c.dm_user_b)
  from public.chat_members cm
  join public.members me on me.community_id = cm.community_id and me.user_id = cm.user_id and me.state in ('profile', 'applied', 'approved')
  join public.chats c on c.id = cm.chat_id
  left join public.members o
    on c.kind = 'dm' and o.community_id = c.community_id
    and o.user_id = case when c.dm_user_a = cm.user_id then c.dm_user_b else c.dm_user_a end
  where cm.chat_id = p_chat and cm.user_id = (select auth.uid()) and cm.community_id = p_community
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.blocked_pair(uuid, uuid, uuid) from public, anon, authenticated;

revoke execute on function public.leave_chat(uuid, uuid, text), public.chat_header(uuid, uuid) from public, anon;
grant execute on function public.leave_chat(uuid, uuid, text), public.chat_header(uuid, uuid) to authenticated;
