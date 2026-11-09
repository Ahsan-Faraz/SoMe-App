-- Step 16: client feedback 261102 (docs/backend-build-plan.md). Unblock; the community admin sees a
-- blocked person's ads and albums; community settings with direct join; the platform admin creates
-- communities and appoints their admins. Only adds, and replaces function bodies with the same
-- signatures, so the build still live keeps working until the new one is switched in.

-- ---------------------------------------------------------------------------------------------
-- Unblock

-- "Blocked people": the people you blocked here, newest first. Few per person; at most 500.
create function public.my_blocks(p_community uuid)
returns table (user_id uuid, username text, icon text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, m.username, p.thumb_path, b.created_at
  from public.blocks b
  join public.members m on m.community_id = b.community_id and m.user_id = b.blocked_id
  left join public.photos p on p.id = m.photo_id
  where b.community_id = p_community and b.blocker_id = (select auth.uid())
    and (select private.is_member(p_community))
  order by b.created_at desc
  limit 500
$$;

-- Undo your own block. The two see each other again and may start a DM. A DM kept with "Keep chat,
-- block writing" opens for writing again, unless the other person has blocked you too; their open
-- chat is told at once. Profile links removed by the block stay removed. Unblocking someone you
-- didn't block does nothing.
create function public.unblock(p_community uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_chat uuid;
begin
  if not (select private.is_member(p_community)) then
    raise exception 'you are not a member here' using errcode = '42501';
  end if;
  -- Locked as in leave_chat, so a send in progress finishes first and a later one sees the change.
  select id into v_chat from public.chats
  where community_id = p_community and kind = 'dm'
    and dm_user_a = least(v_uid, p_user) and dm_user_b = greatest(v_uid, p_user)
  for update;

  delete from public.blocks where community_id = p_community and blocker_id = v_uid and blocked_id = p_user;
  if not found then
    return;
  end if;
  if v_chat is not null and not private.blocked_pair(p_community, v_uid, p_user) then
    perform realtime.send('{}'::jsonb, 'unblocked', 'chat:' || v_chat, true);
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- The community admin sees a blocked person's ads and albums (as they see the profile). A locked
-- album still needs its password. The Ads tab keeps leaving blocked people out, like the Profiles list.

create or replace function private.can_see_albums(p_community uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_owner = (select auth.uid())
    or ((select private.is_approved(p_community))
      and exists (select 1 from public.members where community_id = p_community and user_id = p_owner and state = 'approved')
      and (not private.blocked_pair(p_community, (select auth.uid()), p_owner) or (select private.is_community_admin(p_community))))
$$;

create or replace function private.can_see_ads(p_community uuid, p_author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_approved(p_community))
    and (p_author = (select auth.uid())
      or (exists (select 1 from public.members where community_id = p_community and user_id = p_author and state = 'approved' and not is_system)
        and (not private.blocked_pair(p_community, (select auth.uid()), p_author) or (select private.is_community_admin(p_community)))))
$$;

-- ---------------------------------------------------------------------------------------------
-- Community settings (community admin)

-- Direct join: an application is approved as it's sent, with no admin in between. Nobody would
-- review an image, so none is asked for or kept (no application image, no ID photo).
alter table public.communities add column direct_join boolean not null default false;

-- p_settings: {application_text, require_app_image, require_app_text, require_app_names, direct_join}.
-- Every key is required. Which profile fields are required stays in the profile builder.
create function public.save_community_settings(p_community uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_community_admin(p_community);
  if jsonb_typeof(p_settings) is distinct from 'object'
    or jsonb_typeof(p_settings -> 'application_text') is distinct from 'string'
    or jsonb_typeof(p_settings -> 'require_app_image') is distinct from 'boolean'
    or jsonb_typeof(p_settings -> 'require_app_text') is distinct from 'boolean'
    or jsonb_typeof(p_settings -> 'require_app_names') is distinct from 'boolean'
    or jsonb_typeof(p_settings -> 'direct_join') is distinct from 'boolean' then
    raise exception 'settings are incomplete' using errcode = '22023';
  end if;
  update public.communities
  set application_text = private.text_of(p_settings, 'application_text'),
      require_app_image = (p_settings ->> 'require_app_image')::boolean,
      require_app_text = (p_settings ->> 'require_app_text')::boolean,
      require_app_names = (p_settings ->> 'require_app_names')::boolean,
      direct_join = (p_settings ->> 'direct_join')::boolean
  where id = p_community;
end
$$;

-- A25: as before; in a direct-join community the application is approved as it's sent (images
-- ignored, see direct_join), and the real names go into the admin record as on approval.
create or replace function public.submit_application(p_community uuid, p_application jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members := private.own_member_for_update(p_community);
  v_community public.communities;
  v_photo uuid;
  v_id_photo uuid;
  v_id uuid;
begin
  if v_member.state <> 'profile' then
    raise exception 'you have applied already' using errcode = '23505';
  end if;
  if jsonb_typeof(p_application) is distinct from 'object' then
    raise exception 'application must be an object' using errcode = '22023';
  end if;
  select * into v_community from public.communities where id = p_community;
  if (not v_community.direct_join and v_community.require_app_image and jsonb_typeof(p_application -> 'photo') is distinct from 'object')
    or (not v_community.direct_join and v_community.require_identity and jsonb_typeof(p_application -> 'id_photo') is distinct from 'object')
    or (v_community.require_app_text and private.text_of(p_application, 'message') is null)
    or (v_community.require_app_names and private.text_of(p_application, 'real_name_1') is null) then
    raise exception 'the application misses something the community asks for' using errcode = '23502';
  end if;
  if not private.required_filled(p_community, v_member.user_id) then
    raise exception 'fill in the required fields of your profile first' using errcode = '23514';
  end if;

  if not v_community.direct_join and jsonb_typeof(p_application -> 'photo') = 'object' then
    v_photo := private.insert_photo(p_community, p_application -> 'photo', 'private', 'application');
  end if;
  if not v_community.direct_join and jsonb_typeof(p_application -> 'id_photo') = 'object' then
    v_id_photo := private.insert_photo(p_community, p_application -> 'id_photo', 'private', 'identity');
  end if;

  insert into public.applications (community_id, user_id, photo_id, id_photo_id, message, real_name_1, real_name_2, status, decided_at)
  values (
    p_community, v_member.user_id, v_photo, v_id_photo,
    private.text_of(p_application, 'message'),
    private.text_of(p_application, 'real_name_1'),
    private.text_of(p_application, 'real_name_2'),
    case when v_community.direct_join then 'approved' else 'pending' end,
    case when v_community.direct_join then now() end
  )
  returning id into v_id;

  if v_community.direct_join then
    update public.members set state = 'approved' where community_id = p_community and user_id = v_member.user_id;
    insert into public.admin_records (scope_id, community_id, user_id, real_name_1, real_name_2)
    values (p_community, p_community, v_member.user_id, private.text_of(p_application, 'real_name_1'), private.text_of(p_application, 'real_name_2'))
    on conflict (scope_id, user_id) do update
    set real_name_1 = coalesce(public.admin_records.real_name_1, excluded.real_name_1),
        real_name_2 = coalesce(public.admin_records.real_name_2, excluded.real_name_2),
        updated_at = now();
  else
    update public.members set state = 'applied' where community_id = p_community and user_id = v_member.user_id;
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Platform admin: communities and their admins

-- Top-level app routes a community slug must not take.
create function private.reserved_slug(p_slug text) returns boolean
language sql immutable set search_path = '' as $$
  select p_slug in ('auth', 'api', 'platform')
$$;

create function private.require_platform_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not (select private.is_platform_admin()) then
    raise exception 'only the platform admin can do this' using errcode = '42501';
  end if;
end
$$;

-- The platform screen: every community with its approved members and its admins. Few communities;
-- the count reads the members_state index.
create function public.platform_communities()
returns table (id uuid, slug text, name text, direct_join boolean, members integer, admins text[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.direct_join,
    (select count(*)::integer from public.members m where m.community_id = c.id and m.state = 'approved' and not m.is_system),
    array(
      select m.username from public.members m
      where m.community_id = c.id and m.state = 'approved' and m.role = 'admin' and not m.is_system
      order by lower(m.username)
    )
  from public.communities c
  where (select private.is_platform_admin())
  order by lower(c.name), c.id
  limit 500
$$;

-- A new community with empty lists: its No-reply account and profile layout come from the
-- communities triggers; the admin builds the rest. Returns its id.
create function public.create_community(p_slug text, p_name text, p_headline text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text := lower(btrim(p_slug));
  v_id uuid;
begin
  perform private.require_platform_admin();
  if v_slug is null or v_slug !~ '^[a-z0-9-]{2,40}$' or private.reserved_slug(v_slug) then
    raise exception 'the address can''t be used' using errcode = '22023';
  end if;
  insert into public.communities (slug, name, headline)
  values (v_slug, btrim(p_name), coalesce(btrim(p_headline), ''))
  returning id into v_id;
  return v_id;
end
$$;

-- Make a member of the community its admin (p_admin) or a member again. Appointing someone who is
-- still applying approves them, and their open application with them; its images are deleted like
-- on any approval (returned as {files} for the server to remove from Storage). The first admin of a
-- new community is appointed this way, since nobody there can approve them yet.
create function public.set_community_admin(p_community uuid, p_username text, p_admin boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members;
  v_app uuid;
  v_files text[] := '{}';
begin
  perform private.require_platform_admin();
  if p_admin is null then
    raise exception 'p_admin is required' using errcode = '22023';
  end if;
  select * into v_member from public.members
  where community_id = p_community and lower(username) = lower(btrim(p_username))
    and not is_system and state in ('profile', 'applied', 'approved')
  for update;
  if not found then
    raise exception 'no such member' using errcode = '22023';
  end if;

  if p_admin then
    update public.members set role = 'admin', state = 'approved' where community_id = p_community and user_id = v_member.user_id;
    for v_app in
      update public.applications set status = 'approved', decided_by = (select auth.uid()), decided_at = now()
      where community_id = p_community and user_id = v_member.user_id and chat_id is null and status in ('pending', 'later')
      returning id
    loop
      v_files := v_files || private.drop_application_media(v_app);
    end loop;
  else
    update public.members set role = 'member' where community_id = p_community and user_id = v_member.user_id;
  end if;
  return jsonb_build_object('files', to_jsonb(v_files));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.reserved_slug(text), private.require_platform_admin() from public, anon, authenticated;

revoke execute on function public.my_blocks(uuid), public.unblock(uuid, uuid), public.save_community_settings(uuid, jsonb),
  public.platform_communities(), public.create_community(text, text, text), public.set_community_admin(uuid, text, boolean)
  from public, anon;
grant execute on function public.my_blocks(uuid), public.unblock(uuid, uuid), public.save_community_settings(uuid, jsonb),
  public.platform_communities(), public.create_community(text, text, text), public.set_community_admin(uuid, text, boolean)
  to authenticated;
