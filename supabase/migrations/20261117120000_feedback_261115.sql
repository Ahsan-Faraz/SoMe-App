-- Step 19: client feedback 261115 (SoMe-Test-Guide-261115.docx).
-- 1. Application images (the application image and the ID photo) can be kept after approval: a
--    setting per community and per group (Peter, 261111 and 261115 step 5b). Off by default, which
--    is today's behaviour: deleted as soon as the application is decided. A rejected application's
--    images are always deleted. Kept images go when the member is removed from that community or
--    group, when the group is deleted, or with the account (leaving a group yourself:
--    20261117130000_leave_group_images.sql).
-- 2. Community settings: the 18+ question at sign-up (communities.require_age_18, which had no
--    screen) and the keep setting above.
-- 3. Ads: an ad shows in the Ads tab even when its author's profile is hidden from search. An ad is
--    a conscious choice and can be deleted (Peter, 261115 step 14).
--
-- Live-safe (docs/prod-db-changes-steps-9-11.md): two columns are added, every function keeps its
-- arguments and results, and the new settings keys are optional, so the older build's calls work
-- unchanged (a setting it doesn't send keeps its value).

-- ---------------------------------------------------------------------------------------------
-- 1. Keep application images after approval

alter table public.communities add column keep_application_images boolean not null default false;
alter table public.chats add column keep_application_images boolean not null default false;

-- The images of a decided application: kept when it was approved and its community (or group)
-- keeps them, else deleted (private.drop_application_media). Returns the Storage paths to delete.
create function private.decision_media(p_application uuid, p_decision text) returns text[]
language plpgsql security definer set search_path = '' as $$
begin
  if p_decision = 'approved' and exists (
    select 1
    from public.applications a
    left join public.communities c on a.chat_id is null and c.id = a.community_id
    left join public.chats g on g.id = a.chat_id
    where a.id = p_application and coalesce(g.keep_application_images, c.keep_application_images, false)
  ) then
    return '{}';
  end if;
  return private.drop_application_media(p_application);
end
$$;

-- decide_application (20261021120000_groups.sql, its email line swapped in 20261110130000_logins.sql)
-- deletes the images on every decision; the one call is swapped in place, so the rest of the
-- function stays exactly as it is.
do $$
declare
  v_old constant text := 'v_files := private.drop_application_media(p_application);';
  v_new constant text := 'v_files := private.decision_media(p_application, p_decision);';
  v_def text;
  v_count integer := 0;
begin
  for v_def in
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'decide_application' and strpos(p.prosrc, v_old) > 0
  loop
    execute replace(v_def, v_old, v_new);
    v_count := v_count + 1;
  end loop;
  if v_count <> 1 then
    raise exception 'expected to rewrite decide_application once, rewrote % functions', v_count;
  end if;
end
$$;

-- As in 20261023120000_review_fixes.sql; an approval ("+" in the member list) keeps the images
-- when the group keeps them.
create or replace function private.close_group_applications(p_chat uuid, p_user uuid, p_status text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_app uuid;
  v_files text[] := '{}';
begin
  for v_app in
    update public.applications set status = p_status, decided_by = (select auth.uid()), decided_at = now()
    where chat_id = p_chat and user_id = p_user and status in ('pending', 'later')
    returning id
  loop
    v_files := v_files || private.decision_media(v_app, p_status);
  end loop;
  return v_files;
end
$$;

-- A30 "+", F1: as in 20261023120000_review_fixes.sql; taking someone out of a group also deletes
-- the images the group kept from their application.
create or replace function public.set_group_member(p_community uuid, p_chat uuid, p_user uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_app uuid;
  v_files text[];
begin
  perform private.require_manage_group(p_community, p_chat);
  if p_on then
    if not exists (select 1 from public.members where community_id = p_community and user_id = p_user and state = 'approved' and not is_system) then
      raise exception 'no such member' using errcode = '22023';
    end if;
    perform private.add_group_member(p_community, p_chat, p_user);
    return jsonb_build_object('files', to_jsonb(private.close_group_applications(p_chat, p_user, 'approved')));
  end if;

  if exists (select 1 from public.chat_members where chat_id = p_chat and user_id = p_user and role = 'admin') then
    raise exception 'the group admin can''t be removed' using errcode = '42501';
  end if;
  delete from public.chat_members where chat_id = p_chat and user_id = p_user;
  v_files := private.close_group_applications(p_chat, p_user, 'rejected');
  for v_app in
    select a.id from public.applications a
    -- (community, user) leads, so applications_member finds the person's few rows.
    where a.community_id = p_community and a.user_id = p_user and a.chat_id = p_chat and a.media_deleted_at is null
  loop
    v_files := v_files || private.drop_application_media(v_app);
  end loop;
  return jsonb_build_object('files', to_jsonb(v_files));
end
$$;

-- A31: as in 20261019120000_real_members.sql; removing a member also deletes every application
-- image still kept of them in this community (its groups included).
create or replace function public.remove_member(p_community uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_app uuid;
  v_files text[] := '{}';
begin
  perform private.require_community_admin(p_community);
  if p_user = (select auth.uid()) then
    raise exception 'you cannot remove yourself' using errcode = '42501';
  end if;
  update public.members set state = 'removed'
  where community_id = p_community and user_id = p_user and not is_system and state <> 'removed';
  if not found then
    raise exception 'no such member' using errcode = '22023';
  end if;
  update public.applications set status = 'rejected', decided_by = (select auth.uid()), decided_at = now()
  where community_id = p_community and user_id = p_user and status in ('pending', 'later');
  for v_app in
    select a.id from public.applications a
    where a.community_id = p_community and a.user_id = p_user and a.media_deleted_at is null -- applications_member
  loop
    v_files := v_files || private.drop_application_media(v_app);
  end loop;
  return jsonb_build_object('files', to_jsonb(v_files));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Settings screens

-- As in 20261112120000_feedback_261111.sql, plus two optional keys: require_age_18 (the sign-up's
-- "I am 18 or older") and keep_application_images. A key left out keeps its value.
create or replace function public.save_community_settings(p_community uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_labels jsonb := p_settings -> 'state_labels';
begin
  perform private.require_community_admin(p_community);
  if jsonb_typeof(p_settings) is distinct from 'object'
    or jsonb_typeof(p_settings -> 'application_text') is distinct from 'string'
    or jsonb_typeof(p_settings -> 'require_app_image') is distinct from 'boolean'
    or jsonb_typeof(p_settings -> 'require_app_text') is distinct from 'boolean'
    or jsonb_typeof(p_settings -> 'require_app_names') is distinct from 'boolean'
    or jsonb_typeof(p_settings -> 'direct_join') is distinct from 'boolean'
    or (p_settings ? 'require_age_18' and jsonb_typeof(p_settings -> 'require_age_18') is distinct from 'boolean')
    or (p_settings ? 'keep_application_images' and jsonb_typeof(p_settings -> 'keep_application_images') is distinct from 'boolean') then
    raise exception 'settings are incomplete' using errcode = '22023';
  end if;
  if v_labels is not null and (
    jsonb_typeof(v_labels) is distinct from 'array' or jsonb_array_length(v_labels) <> 3
    or exists (select 1 from jsonb_array_elements(v_labels) as l where jsonb_typeof(l) is distinct from 'string' or char_length(btrim(l #>> '{}')) > 40)
  ) then
    raise exception 'state_labels is 3 texts of at most 40 characters' using errcode = '22023';
  end if;
  update public.communities
  set application_text = private.text_of(p_settings, 'application_text'),
      require_app_image = (p_settings ->> 'require_app_image')::boolean,
      require_app_text = (p_settings ->> 'require_app_text')::boolean,
      require_app_names = (p_settings ->> 'require_app_names')::boolean,
      direct_join = (p_settings ->> 'direct_join')::boolean,
      require_age_18 = coalesce((p_settings ->> 'require_age_18')::boolean, require_age_18),
      keep_application_images = coalesce((p_settings ->> 'keep_application_images')::boolean, keep_application_images),
      state_label_1 = case when v_labels is null then state_label_1 else nullif(btrim(v_labels ->> 0), '') end,
      state_label_2 = case when v_labels is null then state_label_2 else nullif(btrim(v_labels ->> 1), '') end,
      state_label_3 = case when v_labels is null then state_label_3 else nullif(btrim(v_labels ->> 2), '') end
  where id = p_community;
end
$$;

-- A10 "Save": as in 20261021120000_groups.sql, plus keep_application_images (optional, like the
-- other settings: left out, it keeps its value).
create or replace function public.save_group(p_community uuid, p_chat uuid, p_group jsonb) returns uuid
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
      keep_application_images = coalesce((p_group ->> 'keep_application_images')::boolean, keep_application_images),
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

-- A10 and the group's admin screens: as in 20261021120000_groups.sql, plus keep_application_images.
create or replace function public.group_settings(p_community uuid, p_chat uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'headline', c.headline, 'application_text', c.application_text,
    'history', c.history, 'member_list', c.member_list, 'allow_posting', c.allow_posting,
    'allow_commenting', c.allow_commenting, 'allow_reactions', c.allow_reactions,
    'allow_post_editing', c.allow_post_editing, 'direct_join', c.direct_join, 'calendar', c.calendar,
    'visible_in_search', c.visible_in_search, 'require_app_image', c.require_app_image,
    'require_app_text', c.require_app_text, 'require_app_names', c.require_app_names,
    'keep_application_images', c.keep_application_images,
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

-- ---------------------------------------------------------------------------------------------
-- 3. Ads of members hidden from search show in the Ads tab

-- search_ads (20261112120000_feedback_261111.sql) left out authors hidden from search; the one
-- condition is taken out in place, so the rest of the function stays exactly as it is. Blocks,
-- removed members and the filters still apply.
do $$
declare
  v_old constant text := E'      and (m.user_id = f.viewer or m.visible_in_search or not f.show_visibility)\n';
  v_def text;
  v_count integer := 0;
begin
  for v_def in
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_ads' and strpos(p.prosrc, v_old) > 0
  loop
    execute replace(v_def, v_old, '');
    v_count := v_count + 1;
  end loop;
  if v_count <> 1 then
    raise exception 'expected to rewrite search_ads once, rewrote % functions', v_count;
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants (create or replace keeps a function's grants; the new one is internal)

revoke execute on function private.decision_media(uuid, text) from public, anon, authenticated;
