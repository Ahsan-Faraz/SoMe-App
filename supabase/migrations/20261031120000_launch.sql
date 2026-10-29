-- Step 15: launch checks. Two things, both only added (nothing the deployed build calls changes):
--
-- 1. Our own rate limits for the sign-in steps. Log in, join, email codes and password resets run on
--    our server, so Supabase Auth sees the server's IP for every user: its per-IP limits would lock
--    everyone out together. rate_limit_take counts attempts per bucket and key (an IP, a login), and
--    says how long to wait once a key is over its limit. Keys are stored as SHA-256 hashes, never
--    the IP or the email itself. Each attempt takes its slot before it runs, so many tries sent at
--    once can't all pass the check; a success gives the slot back (rate_limit_refund). Only the
--    server (service role) calls these.
--
-- 2. Delete my account (GDPR): delete_my_account removes the caller's account in this community and
--    everything below it in one transaction, returns every file in their folders of both buckets for
--    the server to remove after the response, and deletes the login itself when no account is left.

-- ---------------------------------------------------------------------------------------------
-- 1. Rate limits

create table public.rate_limits (
  bucket text not null check (bucket in ('password', 'code', 'email')),
  key_hash bytea not null, -- sha256(bucket || ':' || key)
  hits integer not null check (hits >= 0),
  since timestamptz not null, -- the window starts at the first hit
  primary key (bucket, key_hash)
);
create index rate_limits_since on public.rate_limits (since);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Take one attempt for every key (p_max[i] attempts per p_window_seconds for p_keys[i]). Returns 0
-- and counts the attempt when every key has room; otherwise the seconds until the fullest key has
-- room again, and counts nothing. At most 4 keys, each at most 320 characters.
create function public.rate_limit_take(p_bucket text, p_keys text[], p_max integer[], p_window_seconds integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_window interval := make_interval(secs => p_window_seconds);
  v_hashes bytea[];
  v_wait integer;
begin
  if coalesce(cardinality(p_keys), 0) not between 1 and 4 or cardinality(p_max) is distinct from cardinality(p_keys)
    or p_window_seconds not between 1 and 86400
    or exists (select 1 from unnest(p_keys) as k where k is null or char_length(k) not between 1 and 320)
    or exists (select 1 from unnest(p_max) as m where m is null or m not between 1 and 1000) then
    raise exception 'rate_limit_take: 1 to 4 keys with a limit each, a window up to a day' using errcode = '22023';
  end if;
  select array_agg(extensions.digest(p_bucket || ':' || k, 'sha256') order by n) into v_hashes from unnest(p_keys) with ordinality as x (k, n);

  -- Old windows go (a few at a time, so this stays cheap).
  delete from public.rate_limits where ctid in (select ctid from public.rate_limits where since < now() - interval '1 day' limit 50);

  -- Lock the keys' rows (made if missing), always in the same order, so attempts at once queue up.
  insert into public.rate_limits (bucket, key_hash, hits, since)
  select p_bucket, h, 0, now() from unnest(v_hashes) as h
  on conflict (bucket, key_hash) do nothing;
  perform 1 from public.rate_limits where bucket = p_bucket and key_hash = any (v_hashes) order by key_hash for update;

  -- A window that has passed starts again.
  update public.rate_limits set hits = 0, since = now()
  where bucket = p_bucket and key_hash = any (v_hashes) and since <= now() - v_window;

  select max(ceil(extract(epoch from (r.since + v_window - now())))::integer) into v_wait
  from public.rate_limits r
  join unnest(v_hashes, p_max) as x (h, m) on r.key_hash = x.h
  where r.bucket = p_bucket and r.hits >= x.m;
  if v_wait is not null then
    return greatest(v_wait, 1);
  end if;

  update public.rate_limits set hits = hits + 1 where bucket = p_bucket and key_hash = any (v_hashes);
  return 0;
end
$$;

-- Give back the attempt for these keys (after a successful log in, a right code).
create function public.rate_limit_refund(p_bucket text, p_keys text[]) returns void
language sql security definer set search_path = '' as $$
  update public.rate_limits set hits = greatest(hits - 1, 0)
  where bucket = p_bucket
    and key_hash in (select extensions.digest(p_bucket || ':' || k, 'sha256') from unnest(p_keys[1:4]) as k where k is not null)
$$;

revoke execute on function public.rate_limit_take(text, text[], integer[], integer), public.rate_limit_refund(text, text[]) from public, anon, authenticated;
grant execute on function public.rate_limit_take(text, text[], integer[], integer), public.rate_limit_refund(text, text[]) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. Delete my account

-- The names of every file in a folder ({community}/{user}/) of a bucket, through Storage's index.
create function private.folder_files(p_bucket text, p_community uuid, p_user uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct o.name), '{}')
  from storage.objects o
  where o.bucket_id = p_bucket
    -- '0' is the character after '/': the range is exactly the names that start with the folder.
    and o.name collate "C" >= (p_community || '/' || p_user || '/') collate "C"
    and o.name collate "C" < (p_community || '/' || p_user || '0') collate "C"
$$;

-- Delete the caller's account in this community: the member row and, through its cascades, their
-- profile, photos, applications, admin records, consents, chats memberships, messages (and the
-- comments on them), reactions, DMs (for both people, as "Delete chat"), blocks, notes (theirs and
-- about them), albums and ads. Events they made stay, without a creator.
-- Also deleted: other people's photos whose post goes with it (in those DMs, or comments on the
-- caller's posts), which would otherwise be left without a message.
-- The community's last admin can't delete their account (the community would have no admin).
-- When no account is left in any community (and they are not a platform admin), the login is
-- deleted too: email, password and sessions.
-- Returns {private: [...], profile: [...], login_deleted}: the files for the server to remove.
create function public.delete_my_account(p_community uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_member public.members;
  v_others uuid[];
  v_private text[];
  v_profile text[];
  v_more text[];
  v_login boolean := false;
begin
  select * into v_member from public.members
  where community_id = p_community and user_id = v_uid and not is_system
  for update;
  if not found then
    raise exception 'no account in this community' using errcode = '42501';
  end if;
  if v_member.role = 'admin' and v_member.state = 'approved' and not exists (
    select 1 from public.members
    where community_id = p_community and role = 'admin' and state = 'approved' and not is_system and user_id <> v_uid
  ) then
    raise exception 'the last community admin can''t delete their account' using errcode = '55000';
  end if;

  -- Other people's photos on posts that go with the account: in the caller's DMs, and in comments
  -- on the caller's posts (at any depth).
  with recursive gone (chat_id, seq) as (
    select m.chat_id, m.seq from public.messages m
    where m.community_id = p_community
      and (m.author_id = v_uid
        or m.chat_id in (select c.id from public.chats c where c.community_id = p_community and (c.dm_user_a = v_uid or c.dm_user_b = v_uid)))
    union
    select r.chat_id, r.seq from public.messages r join gone g on r.chat_id = g.chat_id and r.reply_to_seq = g.seq
  )
  select coalesce(array_agg(distinct m.photo_id), '{}') into v_others
  from gone g join public.messages m on m.chat_id = g.chat_id and m.seq = g.seq
  join public.photos p on p.id = m.photo_id
  where p.owner_id <> v_uid;

  -- Every file in the caller's folders, also uploads that never got a row.
  v_private := private.folder_files('private', p_community, v_uid);
  v_profile := private.folder_files('profile', p_community, v_uid);

  delete from public.members where community_id = p_community and user_id = v_uid;

  with orphans as (delete from public.photos where id = any (v_others) returning bucket, path, thumb_path)
  select coalesce(array_agg(x.path), '{}') into v_more
  from orphans cross join lateral (values (orphans.path), (orphans.thumb_path)) as x (path)
  where orphans.bucket = 'private';
  v_private := v_private || v_more;

  if not exists (select 1 from public.members where user_id = v_uid)
    and not exists (select 1 from public.platform_admins where user_id = v_uid) then
    delete from auth.users where id = v_uid;
    v_login := true;
  end if;

  return jsonb_build_object('private', to_jsonb(v_private), 'profile', to_jsonb(v_profile), 'login_deleted', v_login);
end
$$;

revoke execute on function private.folder_files(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.delete_my_account(uuid) from public, anon;
grant execute on function public.delete_my_account(uuid) to authenticated;
