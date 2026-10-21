-- Step 7: groups and group applications (docs/backend-design.md D9, D10, §4.7, §6.3, §6.10, §6.11).
-- A group is a chat with a name and settings. The creator (community admin, or a member with
-- group-create rights) is its group admin, one per group. A group is run by its group admin or the
-- community admin (private.can_manage_group). Members join directly (direct_join) or apply: the
-- application goes to the group admin's queue; approving adds the member (from the next post when
-- history is off), copies the real names into the group's admin records (scope = the group's chat
-- id) and the No-reply account tells them in a DM. Group settings reach the chat: posting off is
-- enforced on send (admins may always post); commenting, reactions and editing with step 8.
-- Blocks apply in group member lists too. Everything goes through the RPCs below.

-- ---------------------------------------------------------------------------------------------
-- Tables

alter table public.chats
  add column headline text check (char_length(headline) <= 200 and headline = btrim(headline)), -- GROUP_HEADLINE_MAX
  add column application_text text check (char_length(application_text) <= 4000), -- top of the group application (A24)
  add column history boolean not null default true, -- new members see older posts
  add column member_list boolean not null default true, -- members see the member list and count
  add column allow_posting boolean not null default true,
  add column allow_commenting boolean not null default true, -- step 8
  add column allow_reactions boolean not null default true, -- step 8
  add column allow_post_editing boolean not null default true, -- step 8
  add column direct_join boolean not null default false,
  add column calendar boolean not null default true, -- step 12
  add column visible_in_search boolean not null default true, -- D22: "Find new group"
  add column require_app_image boolean not null default false, -- what the group application asks for
  add column require_app_text boolean not null default true,
  add column require_app_names boolean not null default false,
  add column state_label_1 text check (char_length(state_label_1) <= 40), -- the group's 3 "profile state" labels (D24)
  add column state_label_2 text check (char_length(state_label_2) <= 40),
  add column state_label_3 text check (char_length(state_label_3) <= 40);

-- "Find new group" and "Add to groups": a community's groups by name.
create index chats_groups on public.chats (community_id, lower(name)) where kind = 'group';

-- Info 1–3 (G3, B2). An info without a headline is not stored.
create table public.group_info_posts (
  chat_id uuid not null,
  community_id uuid not null,
  n smallint not null check (n between 1 and 3),
  headline text not null check (char_length(headline) between 1 and 120 and headline = btrim(headline)), -- HEADLINE_MAX
  body text not null default '' check (char_length(body) <= 32000), -- FIELD_TEXT_MAX
  primary key (chat_id, n),
  foreign key (community_id, chat_id) references public.chats (community_id, id) on delete cascade
);

alter table public.group_info_posts enable row level security;
revoke all on public.group_info_posts from anon, authenticated;

-- A group application belongs to its group (deleted with it); the group admin's queue (A23).
alter table public.applications
  add constraint applications_chat_fk foreign key (community_id, chat_id) references public.chats (community_id, id) on delete cascade;
create index applications_group_queue on public.applications (chat_id, created_at) where chat_id is not null and status in ('pending', 'later');

-- ---------------------------------------------------------------------------------------------
-- Helpers

-- May the caller run this group of this community: its group admin, or the community admin?
create function private.can_manage_group(p_community uuid, p_chat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chats where id = p_chat and community_id = p_community and kind = 'group')
    and ((select private.is_community_admin(p_community)) or private.is_group_admin(p_chat))
$$;

create function private.require_manage_group(p_community uuid, p_chat uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not private.can_manage_group(p_community, p_chat) then
    raise exception 'only the group admin or the community admin runs this group' using errcode = '42501';
  end if;
end
$$;

-- Add an approved member to a group: with history off they see posts from now on (visible_from_seq).
create function private.add_group_member(p_community uuid, p_chat uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.chat_members (chat_id, community_id, user_id, visible_from_seq)
  select c.id, c.community_id, p_user, case when c.history then 0 else c.last_seq end
  from public.chats c
  where c.id = p_chat and c.community_id = p_community
  on conflict do nothing;
  return found;
end
$$;

-- An automatic DM from the community's No-reply account (§3), e.g. "You are now a member of …".
-- The DM is made the first time; members can't answer in it (send_message refuses).
create function private.system_dm(p_community uuid, p_user uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_system uuid;
  v_chat uuid;
  v_seq bigint;
  v_at timestamptz := now();
begin
  select user_id into v_system from public.members where community_id = p_community and is_system;
  insert into public.chats (community_id, kind, dm_user_a, dm_user_b, created_by)
  values (p_community, 'dm', least(v_system, p_user), greatest(v_system, p_user), v_system)
  on conflict (community_id, dm_user_a, dm_user_b) where kind = 'dm' do nothing
  returning id into v_chat;
  if v_chat is null then
    select id into v_chat from public.chats
    where community_id = p_community and kind = 'dm' and dm_user_a = least(v_system, p_user) and dm_user_b = greatest(v_system, p_user);
  else
    insert into public.chat_members (chat_id, community_id, user_id) values (v_chat, p_community, v_system), (v_chat, p_community, p_user);
  end if;

  update public.chats
  set last_seq = last_seq + 1, last_message_at = v_at, last_message_preview = left(regexp_replace(p_body, '\s+', ' ', 'g'), 160)
  where id = v_chat
  returning last_seq into v_seq;
  insert into public.messages (chat_id, seq, community_id, author_id, kind, body, created_at)
  values (v_chat, v_seq, p_community, v_system, 'system', p_body, v_at);
  perform realtime.send(
    jsonb_build_object('seq', v_seq, 'author_id', v_system, 'author_name', 'No-reply', 'author_status_id', null,
      'kind', 'system', 'body', p_body, 'client_id', null, 'created_at', v_at),
    'message', 'chat:' || v_chat, true
  );
end
$$;

-- A record field (real names, the 3 states, notes) of one member in one scope: the community
-- (scope = community id) or a group (scope = its chat id). Keys left out stay as they are.
create function private.write_admin_record(p_scope uuid, p_community uuid, p_user uuid, p_record jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_record) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(p_record) as k (key)
    where k.key not in ('real_name_1', 'real_name_2', 'state_1', 'state_2', 'state_3', 'notes')
  ) then
    raise exception 'unknown record field' using errcode = '22023';
  end if;

  insert into public.admin_records (scope_id, community_id, user_id)
  values (p_scope, p_community, p_user)
  on conflict (scope_id, user_id) do nothing;

  update public.admin_records
  set real_name_1 = case when p_record ? 'real_name_1' then private.text_of(p_record, 'real_name_1') else real_name_1 end,
      real_name_2 = case when p_record ? 'real_name_2' then private.text_of(p_record, 'real_name_2') else real_name_2 end,
      state_1 = case when p_record ? 'state_1' then (private.text_of(p_record, 'state_1'))::integer else state_1 end,
      state_2 = case when p_record ? 'state_2' then (private.text_of(p_record, 'state_2'))::integer else state_2 end,
      state_3 = case when p_record ? 'state_3' then (private.text_of(p_record, 'state_3'))::integer else state_3 end,
      notes = case when p_record ? 'notes' then private.text_of(p_record, 'notes') else notes end,
      updated_at = now()
  where scope_id = p_scope and user_id = p_user;
end
$$;

-- A21/A31: the community's record of a member (unchanged, now through the shared writer).
create or replace function public.save_admin_record(p_community uuid, p_user uuid, p_record jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_community_admin(p_community);
  if not exists (select 1 from public.members where community_id = p_community and user_id = p_user and not is_system and state <> 'removed') then
    raise exception 'no such member' using errcode = '22023';
  end if;
  perform private.write_admin_record(p_community, p_community, p_user, p_record);
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Create, edit, delete

-- A10 "Save". p_chat null = a new group: the community admin, or a member with group-create rights;
-- the creator becomes its group admin. Otherwise the group admin or the community admin edits it.
-- p_group: {name, headline, application_text, history, member_list, allow_posting, allow_commenting,
--   allow_reactions, allow_post_editing, direct_join, calendar, visible_in_search, require_app_image,
--   require_app_text, require_app_names, state_labels: [3 texts], infos: [3 × {headline, body}]}.
-- Returns the group's id.
create function public.save_group(p_community uuid, p_chat uuid, p_group jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.members;
  v_id uuid := p_chat;
  v_name text := private.text_of(p_group, 'name');
  v_labels jsonb := p_group -> 'state_labels';
  v_infos jsonb := p_group -> 'infos';
begin
  if jsonb_typeof(p_group) is distinct from 'object'
    or (v_labels is not null and jsonb_typeof(v_labels) <> 'array')
    or (v_infos is not null and jsonb_typeof(v_infos) <> 'array') then
    raise exception 'group must be an object' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'a group needs a name' using errcode = '23502';
  end if;

  if v_id is null then
    select * into v_me from public.members
    where community_id = p_community and user_id = (select auth.uid()) and state = 'approved' and not is_system;
    if not found or not (v_me.role = 'admin' or v_me.can_create_groups) then
      raise exception 'only the community admin and members with group-create rights create groups' using errcode = '42501';
    end if;
    insert into public.chats (community_id, kind, name, created_by) values (p_community, 'group', v_name, v_me.user_id)
    returning id into v_id;
    insert into public.chat_members (chat_id, community_id, user_id, role) values (v_id, p_community, v_me.user_id, 'admin');
  else
    perform private.require_manage_group(p_community, v_id);
  end if;

  update public.chats
  set name = v_name,
      headline = private.text_of(p_group, 'headline'),
      application_text = private.text_of(p_group, 'application_text'),
      history = coalesce((p_group ->> 'history')::boolean, history),
      member_list = coalesce((p_group ->> 'member_list')::boolean, member_list),
      allow_posting = coalesce((p_group ->> 'allow_posting')::boolean, allow_posting),
      allow_commenting = coalesce((p_group ->> 'allow_commenting')::boolean, allow_commenting),
      allow_reactions = coalesce((p_group ->> 'allow_reactions')::boolean, allow_reactions),
      allow_post_editing = coalesce((p_group ->> 'allow_post_editing')::boolean, allow_post_editing),
      direct_join = coalesce((p_group ->> 'direct_join')::boolean, direct_join),
      calendar = coalesce((p_group ->> 'calendar')::boolean, calendar),
      visible_in_search = coalesce((p_group ->> 'visible_in_search')::boolean, visible_in_search),
      require_app_image = coalesce((p_group ->> 'require_app_image')::boolean, require_app_image),
      require_app_text = coalesce((p_group ->> 'require_app_text')::boolean, require_app_text),
      require_app_names = coalesce((p_group ->> 'require_app_names')::boolean, require_app_names),
      state_label_1 = nullif(btrim(v_labels ->> 0), ''),
      state_label_2 = nullif(btrim(v_labels ->> 1), ''),
      state_label_3 = nullif(btrim(v_labels ->> 2), '')
  where id = v_id;

  if v_infos is not null then
    delete from public.group_info_posts where chat_id = v_id;
    insert into public.group_info_posts (chat_id, community_id, n, headline, body)
    select v_id, p_community, i.n::smallint, btrim(i.info ->> 'headline'), coalesce(i.info ->> 'body', '')
    from jsonb_array_elements(v_infos) with ordinality as i (info, n)
    where i.n <= 3 and nullif(btrim(i.info ->> 'headline'), '') is not null;
  end if;
  return v_id;
end
$$;

-- A10 "Delete group": the group admin or the community admin. Its messages, members, applications
-- and info posts go with it; so do its admin records.
create function public.delete_group(p_community uuid, p_chat uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_manage_group(p_community, p_chat);
  delete from public.admin_records where scope_id = p_chat and community_id = p_community;
  delete from public.chats where id = p_chat;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads

-- A10 and the group's admin screens (A22/A23/A28/A30): every setting, the info posts and the labels.
-- The group admin or the community admin only; null for anyone else.
create function public.group_settings(p_community uuid, p_chat uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'headline', c.headline, 'application_text', c.application_text,
    'history', c.history, 'member_list', c.member_list, 'allow_posting', c.allow_posting,
    'allow_commenting', c.allow_commenting, 'allow_reactions', c.allow_reactions,
    'allow_post_editing', c.allow_post_editing, 'direct_join', c.direct_join, 'calendar', c.calendar,
    'visible_in_search', c.visible_in_search, 'require_app_image', c.require_app_image,
    'require_app_text', c.require_app_text, 'require_app_names', c.require_app_names,
    'state_labels', jsonb_build_array(c.state_label_1, c.state_label_2, c.state_label_3),
    'infos', coalesce((
      select jsonb_agg(jsonb_build_object('n', i.n, 'headline', i.headline, 'body', i.body) order by i.n)
      from public.group_info_posts i where i.chat_id = c.id
    ), '[]')
  )
  from public.chats c
  where c.id = p_chat and c.community_id = p_community and c.kind = 'group'
    and private.can_manage_group(p_community, p_chat)
$$;

-- G3 group info and B2 info posts, in one call: name, headline, Info 1–3, and the member list and
-- count when the group shows them (or the caller runs it). Members and admins of the group only.
-- Members who blocked each other don't see each other. perf: the first 500 members by name.
create function public.group_info(p_community uuid, p_chat uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_chat public.chats;
  v_manage boolean := private.can_manage_group(p_community, p_chat);
  v_role text;
begin
  select cm.role into v_role
  from public.chat_members cm
  join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id and m.state = 'approved'
  where cm.chat_id = p_chat and cm.user_id = v_uid and cm.community_id = p_community;
  if v_role is null and not v_manage then
    return null;
  end if;
  select * into v_chat from public.chats where id = p_chat and community_id = p_community and kind = 'group';
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_chat.id, 'name', v_chat.name, 'headline', v_chat.headline,
    'member', v_role is not null, 'role', v_role, 'manage', v_manage,
    'infos', coalesce((
      select jsonb_agg(jsonb_build_object('n', i.n, 'headline', i.headline, 'body', i.body) order by i.n)
      from public.group_info_posts i where i.chat_id = p_chat
    ), '[]'),
    'member_count', case when v_chat.member_list or v_manage then (
      select count(*) from public.chat_members cm
      join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id and m.state = 'approved'
      where cm.chat_id = p_chat
    ) end,
    'members', case when v_chat.member_list or v_manage then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'username', x.username, 'icon', x.icon, 'admin', x.admin) order by lower(x.username))
      from (
        select m.user_id, m.username, p.thumb_path as icon, cm.role = 'admin' as admin
        from public.chat_members cm
        join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id and m.state = 'approved'
        left join public.photos p on p.id = m.photo_id
        where cm.chat_id = p_chat
          and (v_manage or not private.blocked_pair(p_community, v_uid, m.user_id))
        order by lower(m.username)
        limit 500
      ) as x
    ), '[]') end
  );
end
$$;

-- A24 and "Find new group": what someone outside the group sees of it: name, headline, the
-- application text and what it asks for, whether it can be joined directly, and whether the caller
-- is already in it or has applied. Approved members only; hidden groups only to their members and
-- admins.
create function public.group_card(p_community uuid, p_chat uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'headline', c.headline, 'application_text', c.application_text,
    'direct_join', c.direct_join,
    'requires', jsonb_build_object('image', c.require_app_image, 'text', c.require_app_text, 'names', c.require_app_names),
    'member', exists (select 1 from public.chat_members cm where cm.chat_id = c.id and cm.user_id = (select auth.uid())),
    'applied', exists (
      select 1 from public.applications a
      where a.community_id = p_community and a.user_id = (select auth.uid()) and a.chat_id = c.id and a.status in ('pending', 'later')
    )
  )
  from public.chats c
  where c.id = p_chat and c.community_id = p_community and c.kind = 'group'
    and (select private.is_approved(p_community))
    and (c.visible_in_search
      or exists (select 1 from public.chat_members cm where cm.chat_id = c.id and cm.user_id = (select auth.uid()))
      or private.can_manage_group(p_community, p_chat))
$$;

-- A2 "Find new user/group": groups visible in search that the caller is not in, by name.
-- (Typing to search arrives with find_new in step 9.)
create function public.group_directory(p_community uuid, p_limit integer default 50)
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

-- F1 "Add to groups" for one member: the groups the caller may add them to (every group for the
-- community admin, their own groups for a group admin), whether they are in each, and their
-- group-create rights (shown to the community admin only).
create function public.group_assignments(p_community uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'can_create_groups', case when (select private.is_community_admin(p_community)) then (
      select can_create_groups from public.members where community_id = p_community and user_id = p_user
    ) end,
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name,
        'member', exists (select 1 from public.chat_members t where t.chat_id = c.id and t.user_id = p_user)
      ) order by lower(c.name))
      from public.chats c
      where c.community_id = p_community and c.kind = 'group'
        and ((select private.is_community_admin(p_community)) or private.is_group_admin(c.id))
    ), '[]')
  )
  where (select private.is_approved(p_community))
$$;

-- A23/A30: the group's open applications (p_applications) or its members, with the group's admin
-- records. Real names: the record's, else the application's. Same columns as admin_roster.
-- The group admin or the community admin only. perf: up to 2,000 (paged in step 11 if needed).
create function public.group_roster(p_community uuid, p_chat uuid, p_applications boolean)
returns table (
  user_id uuid, username text, status_id uuid, application_id uuid, message text,
  real_name_1 text, real_name_2 text, state_1 integer, state_2 integer, state_3 integer, notes text
)
language sql stable security definer set search_path = '' as $$
  (select m.user_id, m.username, m.status_id, a.id, a.message,
     coalesce(r.real_name_1, a.real_name_1), coalesce(r.real_name_2, a.real_name_2), r.state_1, r.state_2, r.state_3, r.notes
   from public.applications a
   join public.members m on m.community_id = a.community_id and m.user_id = a.user_id and m.state = 'approved'
   left join public.admin_records r on r.scope_id = a.chat_id and r.user_id = a.user_id
   where p_applications and private.can_manage_group(p_community, p_chat)
     and a.chat_id = p_chat and a.community_id = p_community and a.status in ('pending', 'later')
   order by a.created_at
   limit 2000)
  union all
  (select m.user_id, m.username, m.status_id, null::uuid, null::text,
     r.real_name_1, r.real_name_2, r.state_1, r.state_2, r.state_3, r.notes
   from public.chat_members cm
   join public.members m on m.community_id = cm.community_id and m.user_id = cm.user_id and m.state = 'approved'
   left join public.admin_records r on r.scope_id = cm.chat_id and r.user_id = cm.user_id
   where not p_applications and private.can_manage_group(p_community, p_chat)
     and cm.chat_id = p_chat and cm.community_id = p_community
   order by lower(m.username)
   limit 2000)
$$;

-- A22: one person in the group's admin view: their latest application to the group and the group's
-- record. Null unless they are in the group or have applied to it. The group admin or the community
-- admin only. The image path is returned for the server to sign.
create function public.group_member(p_community uuid, p_chat uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  perform private.require_manage_group(p_community, p_chat);
  select jsonb_build_object(
    'user_id', m.user_id,
    'member', exists (select 1 from public.chat_members cm where cm.chat_id = p_chat and cm.user_id = p_user),
    'application', (
      select jsonb_build_object(
        'id', a.id, 'status', a.status, 'message', a.message, 'real_name_1', a.real_name_1, 'real_name_2', a.real_name_2,
        'created_at', a.created_at, 'photo', private.photo_json(p), 'id_photo', null,
        'media_deleted_at', a.media_deleted_at,
        'decided_by', (select d.username from public.members d where d.community_id = a.community_id and d.user_id = a.decided_by)
      )
      from public.applications a
      left join public.photos p on p.id = a.photo_id
      where a.community_id = p_community and a.user_id = p_user and a.chat_id = p_chat
      order by a.created_at desc
      limit 1
    ),
    'record', (
      select jsonb_build_object(
        'real_name_1', r.real_name_1, 'real_name_2', r.real_name_2,
        'state_1', r.state_1, 'state_2', r.state_2, 'state_3', r.state_3, 'notes', r.notes
      )
      from public.admin_records r
      where r.scope_id = p_chat and r.user_id = p_user
    )
  ) into v_result
  from public.members m
  where m.community_id = p_community and m.user_id = p_user and m.state = 'approved' and not m.is_system
    and (exists (select 1 from public.chat_members cm where cm.chat_id = p_chat and cm.user_id = p_user)
      or exists (select 1 from public.applications a where a.chat_id = p_chat and a.user_id = p_user));
  return v_result;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Joining

-- A2/A24 "Join": a group that allows direct join. From the next post when its history is off.
create function public.join_group(p_community uuid, p_chat uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_approved(p_community)) or not exists (
    select 1 from public.chats where id = p_chat and community_id = p_community and kind = 'group' and direct_join
  ) then
    raise exception 'this group can''t be joined directly' using errcode = '42501';
  end if;
  perform private.add_group_member(p_community, p_chat, (select auth.uid()));
end
$$;

-- A24: apply to a group, once while open. p_application: {photo?, message?, real_name_1?,
-- real_name_2?}; what the group asks for must be there. Approved members not in the group.
create function public.apply_to_group(p_community uuid, p_chat uuid, p_application jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_chat public.chats;
  v_photo uuid;
  v_id uuid;
begin
  if not (select private.is_approved(p_community)) then
    raise exception 'only members apply to groups' using errcode = '42501';
  end if;
  select * into v_chat from public.chats where id = p_chat and community_id = p_community and kind = 'group';
  if not found or v_chat.direct_join then
    raise exception 'no application for this group' using errcode = '22023';
  end if;
  if exists (select 1 from public.chat_members where chat_id = p_chat and user_id = v_uid) then
    raise exception 'you are in this group already' using errcode = '23505';
  end if;
  if jsonb_typeof(p_application) is distinct from 'object' then
    raise exception 'application must be an object' using errcode = '22023';
  end if;
  if (v_chat.require_app_image and jsonb_typeof(p_application -> 'photo') is distinct from 'object')
    or (v_chat.require_app_text and private.text_of(p_application, 'message') is null)
    or (v_chat.require_app_names and private.text_of(p_application, 'real_name_1') is null) then
    raise exception 'the application misses something the group asks for' using errcode = '23502';
  end if;

  if jsonb_typeof(p_application -> 'photo') = 'object' then
    v_photo := private.insert_photo(p_community, p_application -> 'photo', 'private', 'application');
  end if;
  insert into public.applications (community_id, user_id, chat_id, photo_id, message, real_name_1, real_name_2)
  values (
    p_community, v_uid, p_chat, v_photo,
    private.text_of(p_application, 'message'),
    private.text_of(p_application, 'real_name_1'),
    private.text_of(p_application, 'real_name_2')
  )
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Running a group (the group admin or the community admin)

-- A22/A30: the group's record of a member or applicant.
create function public.save_group_record(p_community uuid, p_chat uuid, p_user uuid, p_record jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_manage_group(p_community, p_chat);
  if not exists (select 1 from public.chat_members where chat_id = p_chat and user_id = p_user)
    and not exists (select 1 from public.applications where chat_id = p_chat and user_id = p_user and status in ('pending', 'later')) then
    raise exception 'no such member' using errcode = '22023';
  end if;
  perform private.write_admin_record(p_chat, p_community, p_user, p_record);
end
$$;

-- A30 "+", F1 "Add to groups": add an approved member to the group (p_on) or take them out (an
-- open application to it is closed too). The group admin can't be taken out (set another first).
create function public.set_group_member(p_community uuid, p_chat uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_manage_group(p_community, p_chat);
  if p_on then
    if not exists (select 1 from public.members where community_id = p_community and user_id = p_user and state = 'approved' and not is_system) then
      raise exception 'no such member' using errcode = '22023';
    end if;
    perform private.add_group_member(p_community, p_chat, p_user);
    update public.applications set status = 'approved', decided_by = (select auth.uid()), decided_at = now()
    where chat_id = p_chat and user_id = p_user and status in ('pending', 'later');
    return;
  end if;

  if exists (select 1 from public.chat_members where chat_id = p_chat and user_id = p_user and role = 'admin') then
    raise exception 'the group admin can''t be removed' using errcode = '42501';
  end if;
  delete from public.chat_members where chat_id = p_chat and user_id = p_user;
  update public.applications set status = 'rejected', decided_by = (select auth.uid()), decided_at = now()
  where chat_id = p_chat and user_id = p_user and status in ('pending', 'later');
end
$$;

-- §6.11: the community admin makes a member the group's admin (D10: one per group; the old admin
-- stays a member).
create function public.set_group_admin(p_community uuid, p_chat uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_community_admin(p_community);
  if not exists (select 1 from public.chats where id = p_chat and community_id = p_community and kind = 'group')
    or not exists (select 1 from public.members where community_id = p_community and user_id = p_user and state = 'approved' and not is_system) then
    raise exception 'no such group or member' using errcode = '22023';
  end if;
  update public.chat_members set role = 'member' where chat_id = p_chat and role = 'admin' and user_id <> p_user;
  perform private.add_group_member(p_community, p_chat, p_user);
  update public.chat_members set role = 'admin' where chat_id = p_chat and user_id = p_user;
end
$$;

-- F1 "Group create/admin rights" (D9): the community admin only.
create function public.set_group_rights(p_community uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_community_admin(p_community);
  update public.members set can_create_groups = p_on
  where community_id = p_community and user_id = p_user and not is_system and state <> 'removed';
  if not found then
    raise exception 'no such member' using errcode = '22023';
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Chats: group rules (unchanged otherwise)

-- A1: a group shows to its members from the start, before its first post.
create or replace function public.chat_list(p_community uuid, p_limit integer default 50)
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
    and (c.kind = 'group' or c.last_seq > 0 or c.created_by = me.user_id)
  order by c.last_seq > greatest(cm.last_read_seq, cm.visible_from_seq) desc, coalesce(c.last_message_at, c.created_at) desc, c.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
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

-- A4 header: + what the viewer may do in this chat, the calendar and the Info 1 headline (the info bar).
drop function public.chat_header(uuid, uuid);
create function public.chat_header(p_community uuid, p_chat uuid)
returns table (
  chat_id uuid, kind text, name text, other_user_id uuid, my_role text, last_seq bigint, last_read_seq bigint, blocked boolean,
  manage boolean, can_post boolean, allow_commenting boolean, allow_reactions boolean, allow_post_editing boolean,
  calendar boolean, info_headline text
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, coalesce(c.name, o.username), o.user_id, cm.role, c.last_seq, cm.last_read_seq,
    x.blocked, x.manage,
    case when c.kind = 'group' then c.allow_posting or x.manage else not x.blocked and not coalesce(o.is_system, false) end,
    c.kind = 'dm' or c.allow_commenting or x.manage, c.kind = 'dm' or c.allow_reactions or x.manage, c.kind = 'dm' or c.allow_post_editing or x.manage,
    c.kind = 'group' and c.calendar,
    (select i.headline from public.group_info_posts i where i.chat_id = c.id order by i.n limit 1)
  from public.chat_members cm
  join public.members me on me.community_id = cm.community_id and me.user_id = cm.user_id and me.state in ('profile', 'applied', 'approved')
  join public.chats c on c.id = cm.chat_id
  left join public.members o
    on c.kind = 'dm' and o.community_id = c.community_id
    and o.user_id = case when c.dm_user_a = cm.user_id then c.dm_user_b else c.dm_user_a end
  cross join lateral (
    select c.kind = 'dm' and private.blocked_pair(c.community_id, c.dm_user_a, c.dm_user_b) as blocked,
      c.kind = 'group' and private.can_manage_group(c.community_id, c.id) as manage
  ) as x
  where cm.chat_id = p_chat and cm.user_id = (select auth.uid()) and cm.community_id = p_community
$$;

create or replace function public.decide_application(p_application uuid, p_decision text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications;
  v_email text;
  v_files text[] := '{}';
begin
  if p_decision is null or p_decision not in ('approved', 'later', 'rejected') then
    raise exception 'unknown decision' using errcode = '22023';
  end if;
  select * into v_app from public.applications where id = p_application for update;
  if not found or not (case
    when v_app.chat_id is null then private.is_community_admin(v_app.community_id)
    else private.can_manage_group(v_app.community_id, v_app.chat_id)
  end) then
    raise exception 'only the admin of the community or group decides this application' using errcode = '42501';
  end if;
  if v_app.status not in ('pending', 'later') then
    raise exception 'this application is decided already' using errcode = '23514';
  end if;

  update public.applications
  set status = p_decision,
      decided_by = case when p_decision = 'later' then null else (select auth.uid()) end,
      decided_at = case when p_decision = 'later' then null else now() end
  where id = p_application;

  if v_app.chat_id is not null then
    -- A group (§6.3): approving adds the member (respecting the history setting), copies the real
    -- names into the group's record and the No-reply account tells them. Their community account
    -- is not touched either way.
    if p_decision = 'approved' then
      perform private.add_group_member(v_app.community_id, v_app.chat_id, v_app.user_id);
      insert into public.admin_records (scope_id, community_id, user_id, real_name_1, real_name_2)
      values (v_app.chat_id, v_app.community_id, v_app.user_id, v_app.real_name_1, v_app.real_name_2)
      on conflict (scope_id, user_id) do update
      set real_name_1 = coalesce(public.admin_records.real_name_1, excluded.real_name_1),
          real_name_2 = coalesce(public.admin_records.real_name_2, excluded.real_name_2),
          updated_at = now();
      perform private.system_dm(v_app.community_id, v_app.user_id,
        'You are now a member of ' || (select name from public.chats where id = v_app.chat_id) || '.');
    end if;
  elsif p_decision = 'approved' then
    update public.members set state = 'approved'
    where community_id = v_app.community_id and user_id = v_app.user_id and state in ('profile', 'applied');
    insert into public.admin_records (scope_id, community_id, user_id, real_name_1, real_name_2)
    values (v_app.community_id, v_app.community_id, v_app.user_id, v_app.real_name_1, v_app.real_name_2)
    on conflict (scope_id, user_id) do update
    set real_name_1 = coalesce(public.admin_records.real_name_1, excluded.real_name_1),
        real_name_2 = coalesce(public.admin_records.real_name_2, excluded.real_name_2),
        updated_at = now();
    select u.email into v_email from auth.users u where u.id = v_app.user_id;
  elsif p_decision = 'rejected' then
    update public.members set state = 'rejected'
    where community_id = v_app.community_id and user_id = v_app.user_id and state in ('profile', 'applied');
  end if;
  if p_decision in ('approved', 'rejected') then
    v_files := private.drop_application_media(p_application);
  end if;

  return jsonb_build_object(
    'user_id', v_app.user_id,
    'email', v_email,
    'username', (select username from public.members where community_id = v_app.community_id and user_id = v_app.user_id),
    'files', to_jsonb(v_files)
  );
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.can_manage_group(uuid, uuid), private.require_manage_group(uuid, uuid),
  private.add_group_member(uuid, uuid, uuid), private.system_dm(uuid, uuid, text),
  private.write_admin_record(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

revoke execute on function
  public.save_group(uuid, uuid, jsonb), public.delete_group(uuid, uuid), public.group_settings(uuid, uuid),
  public.group_info(uuid, uuid), public.group_card(uuid, uuid), public.group_directory(uuid, integer),
  public.group_assignments(uuid, uuid), public.group_roster(uuid, uuid, boolean), public.group_member(uuid, uuid, uuid),
  public.join_group(uuid, uuid), public.apply_to_group(uuid, uuid, jsonb), public.save_group_record(uuid, uuid, uuid, jsonb),
  public.set_group_member(uuid, uuid, uuid, boolean), public.set_group_admin(uuid, uuid, uuid),
  public.set_group_rights(uuid, uuid, boolean), public.chat_header(uuid, uuid)
from public, anon;
grant execute on function
  public.save_group(uuid, uuid, jsonb), public.delete_group(uuid, uuid), public.group_settings(uuid, uuid),
  public.group_info(uuid, uuid), public.group_card(uuid, uuid), public.group_directory(uuid, integer),
  public.group_assignments(uuid, uuid), public.group_roster(uuid, uuid, boolean), public.group_member(uuid, uuid, uuid),
  public.join_group(uuid, uuid), public.apply_to_group(uuid, uuid, jsonb), public.save_group_record(uuid, uuid, uuid, jsonb),
  public.set_group_member(uuid, uuid, uuid, boolean), public.set_group_admin(uuid, uuid, uuid),
  public.set_group_rights(uuid, uuid, boolean), public.chat_header(uuid, uuid)
to authenticated;
