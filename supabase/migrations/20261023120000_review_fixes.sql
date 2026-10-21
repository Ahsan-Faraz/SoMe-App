-- Review of steps 5b–8 (2026-10-23).
-- 1. Group applications closed by adding or removing the person directly (A30 "+", F1) delete their
--    images, like any decided application (D31); so does deleting the group.
-- 2. Deleting a group finds its applications through an index (the cascade scanned them all).
-- 3. The join form's "this email already has a login" notice goes out at most once an hour per
--    address, so the form can't be used to flood someone's inbox (D32 hides whether the email
--    exists; this keeps that from becoming an email cannon).

-- ---------------------------------------------------------------------------------------------
-- 2. Applications of a group

create index applications_chat on public.applications (chat_id) where chat_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 1. Closing a group application deletes its images

-- The images of every open application of this person to this group, closed now: their files.
create function private.close_group_applications(p_chat uuid, p_user uuid, p_status text) returns text[]
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
    v_files := v_files || private.drop_application_media(v_app);
  end loop;
  return v_files;
end
$$;

-- A30 "+", F1: as before (add an approved member, or take them out; never the group admin), and an
-- open application closed by it loses its images. Returns {files} for the server to delete.
drop function public.set_group_member(uuid, uuid, uuid, boolean);
create function public.set_group_member(p_community uuid, p_chat uuid, p_user uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  return jsonb_build_object('files', to_jsonb(private.close_group_applications(p_chat, p_user, 'rejected')));
end
$$;

-- A10 "Delete group": as before, and its applications' images go too (they are deleted with it).
create or replace function public.delete_group(p_community uuid, p_chat uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_photos uuid[];
  v_app uuid;
  v_files text[] := '{}';
begin
  perform private.require_manage_group(p_community, p_chat);
  select coalesce(array_agg(photo_id), '{}') into v_photos from public.messages where chat_id = p_chat and photo_id is not null;
  for v_app in select id from public.applications where chat_id = p_chat and media_deleted_at is null loop
    v_files := v_files || private.drop_application_media(v_app);
  end loop;
  delete from public.admin_records where scope_id = p_chat and community_id = p_community;
  delete from public.chats where id = p_chat;
  return jsonb_build_object('files', to_jsonb(v_files || private.drop_photos(v_photos)));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Join notices: at most one an hour per address

-- Only a hash of the address is kept, never the address itself.
create table private.join_notices (
  email_hash text primary key,
  sent_at timestamptz not null default now()
);

-- Server only (service role): should the notice go out now? Records it when it does.
create function public.join_notice_due(p_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.join_notices (email_hash) values (md5(lower(btrim(p_email))))
  on conflict (email_hash) do update set sent_at = now()
  where private.join_notices.sent_at < now() - interval '1 hour';
  return found;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function private.close_group_applications(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.set_group_member(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.set_group_member(uuid, uuid, uuid, boolean) to authenticated;
revoke all on private.join_notices from public, anon, authenticated;
revoke execute on function public.join_notice_due(text) from public, anon, authenticated;
grant execute on function public.join_notice_due(text) to service_role;
