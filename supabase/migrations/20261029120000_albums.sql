-- Step 13: albums (B3). A member's albums, each with up to 200 photos in the private bucket; the
-- owner adds (camera = Taken in app, or upload) and deletes them. An album may have a password:
-- others then see its name and a folder, never a photo, until the database checks the password; that
-- opens it for them for an hour (album_grants), the life of the links the server signs. The hash is never read
-- by anyone: no client grants on these tables, every read and write is an RPC that checks the caller.
-- Wrong passwords: 5 per album and person in 15 minutes, then they wait (checked before bcrypt runs).

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)), -- NAME_MAX
  password_hash text, -- extensions.crypt(password, gen_salt('bf', 10)); null = open to members
  created_at timestamptz not null default now(),
  unique (community_id, id),
  foreign key (community_id, owner_id) references public.members on delete cascade
);
create index albums_owner on public.albums (community_id, owner_id, created_at);

-- A photo is in one album; deleting the photo (or the album) removes the link.
create table public.album_photos (
  album_id uuid not null references public.albums on delete cascade,
  photo_id uuid not null unique references public.photos on delete cascade,
  community_id uuid not null,
  position integer not null,
  primary key (album_id, photo_id)
);
create index album_photos_order on public.album_photos (album_id, position);

-- Opened with the password: open for this person until `until` (an hour; the signed links' life).
create table public.album_grants (
  album_id uuid not null references public.albums on delete cascade,
  user_id uuid not null,
  until timestamptz not null,
  primary key (album_id, user_id)
);

-- Wrong passwords per album and person, counted from `since`.
create table public.album_attempts (
  album_id uuid not null references public.albums on delete cascade,
  user_id uuid not null,
  failures smallint not null,
  since timestamptz not null,
  primary key (album_id, user_id)
);

alter table public.albums enable row level security;
alter table public.album_photos enable row level security;
alter table public.album_grants enable row level security;
alter table public.album_attempts enable row level security;
revoke all on public.albums, public.album_photos, public.album_grants, public.album_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Every photo row (profile, application, chat, album): the check that both files were uploaded now
-- uses Storage's index. Its names are indexed in the "C" collation; compared in the default one,
-- the lookup read every object (13 ms in the speed check, and growing with Storage). Same arguments
-- and result as 20261016120000_applications.sql.

create or replace function private.insert_photo(p_community uuid, p_photo jsonb, p_bucket text, p_purpose text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_path text := p_photo ->> 'path';
  v_thumb text := regexp_replace(v_path, '\.(webp|jpg)$', '_t.\1');
  v_taken boolean := coalesce((p_photo ->> 'taken_in_app')::boolean, false);
  v_id uuid;
begin
  if jsonb_typeof(p_photo) is distinct from 'object'
    or v_path is null
    or v_path !~ ('^' || p_community || '/' || v_uid || '/[0-9a-f-]{36}\.(webp|jpg)$')
    or p_photo ->> 'thumb_path' is distinct from v_thumb then
    raise exception 'photo path must be in your own folder' using errcode = '22023';
  end if;
  if (select count(*) from storage.objects
      where bucket_id = p_bucket and name collate "C" in (v_path collate "C", v_thumb collate "C")) <> 2 then
    raise exception 'upload the photo and its thumbnail first' using errcode = '22023';
  end if;

  insert into public.photos (community_id, owner_id, bucket, path, thumb_path, width, height, taken_in_app, taken_at, purpose)
  values (
    p_community, v_uid, p_bucket, v_path, v_thumb,
    (p_photo ->> 'width')::integer, (p_photo ->> 'height')::integer,
    v_taken, case when v_taken then now() end, p_purpose
  )
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Who sees what

-- May the caller see this member's albums at all? Themselves; else both approved, no block either way.
create function private.can_see_albums(p_community uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_owner = (select auth.uid())
    or ((select private.is_approved(p_community))
      and exists (select 1 from public.members where community_id = p_community and user_id = p_owner and state = 'approved')
      and not private.blocked_pair(p_community, (select auth.uid()), p_owner))
$$;

-- The caller's access to an album: 'owner', 'open' (no password, or opened within the hour),
-- 'locked', or null (no such album, or not theirs to see).
create function private.album_access(p_community uuid, p_album uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when a.owner_id = (select auth.uid()) then 'owner'
    when not private.can_see_albums(p_community, a.owner_id) then null
    when a.password_hash is null then 'open'
    when exists (select 1 from public.album_grants g where g.album_id = a.id and g.user_id = (select auth.uid()) and g.until > now()) then 'open'
    else 'locked'
  end
  from public.albums a
  where a.id = p_album and a.community_id = p_community
$$;

-- Storage: no policy lets others read album files. The server signs an album's files (service role)
-- right after album_view has checked, once, that the album is open to the caller: a policy would
-- check each file again (200 thumbnails: 188 ms in the speed check). The owner reads their own
-- folder through private_photos_own_read ("From profile/album").

-- ---------------------------------------------------------------------------------------------
-- Reads

-- B3 list: a member's albums, oldest first. A locked album never has a cover, not even for its owner.
create function public.album_list(p_community uuid, p_owner uuid)
returns table (id uuid, name text, locked boolean, photos integer, cover text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.name, a.password_hash is not null,
    (select count(*)::integer from public.album_photos ap where ap.album_id = a.id),
    case when a.password_hash is null then (
      select p.thumb_path from public.album_photos ap join public.photos p on p.id = ap.photo_id
      where ap.album_id = a.id order by ap.position limit 1
    ) end
  from public.albums a
  where (select private.can_see_albums(p_community, p_owner))
    and a.community_id = p_community and a.owner_id = p_owner
  order by a.created_at, a.id
  limit 50
$$;

-- B4: one album. Its photos only when it is open to the caller (owner, no password, or opened).
create function public.album_view(p_community uuid, p_album uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with access as materialized (select private.album_access(p_community, p_album) as access)
  select jsonb_build_object(
    'id', a.id, 'owner_id', a.owner_id, 'name', a.name, 'locked', a.password_hash is not null, 'access', x.access,
    'photos', case when x.access in ('owner', 'open') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'path', p.path, 'thumb_path', p.thumb_path, 'width', p.width, 'height', p.height,
        'taken_in_app', p.taken_in_app, 'taken_at', p.taken_at
      ) order by ap.position)
      from public.album_photos ap join public.photos p on p.id = ap.photo_id
      where ap.album_id = a.id
    ), '[]') else '[]' end
  )
  from public.albums a, access x
  where a.id = p_album and a.community_id = p_community and x.access is not null
$$;

-- "From profile/album" (chat, ad): the caller's own album photos, newest first, to copy from.
create function public.my_album_photos(p_community uuid, p_limit integer default 200)
returns table (id uuid, path text, thumb_path text, taken_in_app boolean, taken_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.path, p.thumb_path, p.taken_in_app, p.taken_at
  from public.photos p
  where p.community_id = p_community and p.owner_id = (select auth.uid()) and p.purpose = 'album'
    and (select private.is_approved(p_community))
  order by p.created_at desc, p.id
  limit least(greatest(p_limit, 1), 200)
$$;

-- ---------------------------------------------------------------------------------------------
-- Writes (the owner's)

create function private.require_album_owner(p_community uuid, p_album uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_approved(p_community))
    or not exists (select 1 from public.albums where id = p_album and community_id = p_community and owner_id = (select auth.uid())) then
    raise exception 'only the album''s owner can change it' using errcode = '42501';
  end if;
end
$$;

-- A new album (at most 50 each). Returns its id.
create function public.create_album(p_community uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not (select private.is_approved(p_community)) then
    raise exception 'members only' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'an album name is 1 to 80 characters' using errcode = '22023';
  end if;
  -- One member's own rows: the lock keeps two quick taps from passing the cap together.
  perform 1 from public.members where community_id = p_community and user_id = (select auth.uid()) for update;
  if (select count(*) from public.albums where community_id = p_community and owner_id = (select auth.uid())) >= 50 then
    raise exception 'at most 50 albums' using errcode = '22023';
  end if;
  insert into public.albums (community_id, owner_id, name) values (p_community, (select auth.uid()), v_name) returning id into v_id;
  return v_id;
end
$$;

-- Delete an album and its photos. Returns {files} for the server to remove from Storage.
create function public.delete_album(p_community uuid, p_album uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_files text[];
begin
  perform private.require_album_owner(p_community, p_album);
  with gone as (
    delete from public.photos p using public.album_photos ap
    where ap.album_id = p_album and p.id = ap.photo_id
    returning p.path, p.thumb_path
  )
  select coalesce(array_agg(x.path), '{}') into v_files from gone cross join lateral (values (gone.path), (gone.thumb_path)) as x (path);
  delete from public.albums where id = p_album;
  return jsonb_build_object('files', to_jsonb(v_files));
end
$$;

-- Add an uploaded photo (both files in your folder of the private bucket) to your album, last.
-- At most 200 an album. Returns the photo as album_view gives it.
create function public.add_album_photo(p_community uuid, p_album uuid, p_photo jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_position integer;
  v_id uuid;
begin
  perform private.require_album_owner(p_community, p_album);
  -- The album row is locked: two uploads at once still count and number in turn.
  perform 1 from public.albums where id = p_album for update;
  select count(*), coalesce(max(position), 0) + 1 into v_count, v_position from public.album_photos where album_id = p_album;
  if v_count >= 200 then
    raise exception 'at most 200 photos an album' using errcode = '22023';
  end if;
  v_id := private.insert_photo(p_community, p_photo, 'private', 'album');
  insert into public.album_photos (album_id, photo_id, community_id, position) values (p_album, v_id, p_community, v_position);
  return (
    select jsonb_build_object('id', p.id, 'path', p.path, 'thumb_path', p.thumb_path, 'width', p.width, 'height', p.height,
      'taken_in_app', p.taken_in_app, 'taken_at', p.taken_at)
    from public.photos p where p.id = v_id
  );
end
$$;

-- Delete one of your album photos. Returns {files} for the server to remove from Storage.
create function public.remove_album_photo(p_community uuid, p_photo uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_album uuid := (select album_id from public.album_photos where photo_id = p_photo and community_id = p_community);
  v_files text[];
begin
  if v_album is null then
    raise exception 'no such album photo' using errcode = '22023';
  end if;
  perform private.require_album_owner(p_community, v_album);
  with gone as (delete from public.photos where id = p_photo returning path, thumb_path)
  select coalesce(array_agg(x.path), '{}') into v_files from gone cross join lateral (values (gone.path), (gone.thumb_path)) as x (path);
  return jsonb_build_object('files', to_jsonb(v_files));
end
$$;

-- Set (4 to 72 characters) or remove (null or empty) an album's password. Everyone it was opened
-- for has to give the new one.
create function public.set_album_password(p_community uuid, p_album uuid, p_password text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_album_owner(p_community, p_album);
  if coalesce(p_password, '') <> '' and char_length(p_password) not between 4 and 72 then
    raise exception 'a password is 4 to 72 characters' using errcode = '22023';
  end if;
  update public.albums
  set password_hash = case when coalesce(p_password, '') = '' then null else extensions.crypt(p_password, extensions.gen_salt('bf', 10)) end
  where id = p_album;
  delete from public.album_grants where album_id = p_album;
  delete from public.album_attempts where album_id = p_album;
end
$$;

-- Open a locked album: 'open' (and open for an hour), 'wrong', or 'wait' (5 wrong in 15 minutes).
create function public.open_album(p_community uuid, p_album uuid, p_password text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_access text := private.album_access(p_community, p_album);
  v_uid uuid := (select auth.uid());
  v_hash text;
  v_tries public.album_attempts;
begin
  if v_access is null then
    raise exception 'no such album' using errcode = '42501';
  end if;
  if v_access in ('owner', 'open') then
    return 'open';
  end if;

  select * into v_tries from public.album_attempts where album_id = p_album and user_id = v_uid;
  if v_tries.failures >= 5 and v_tries.since > now() - interval '15 minutes' then
    return 'wait';
  end if;

  select password_hash into v_hash from public.albums where id = p_album;
  if char_length(coalesce(p_password, '')) between 1 and 72 and extensions.crypt(p_password, v_hash) = v_hash then
    insert into public.album_grants (album_id, user_id, until) values (p_album, v_uid, now() + interval '1 hour')
    on conflict (album_id, user_id) do update set until = excluded.until;
    delete from public.album_attempts where album_id = p_album and user_id = v_uid;
    return 'open';
  end if;

  insert into public.album_attempts (album_id, user_id, failures, since) values (p_album, v_uid, 1, now())
  on conflict (album_id, user_id) do update
  set failures = case when public.album_attempts.since > now() - interval '15 minutes' then public.album_attempts.failures + 1 else 1 end,
      since = case when public.album_attempts.since > now() - interval '15 minutes' then public.album_attempts.since else now() end;
  return 'wrong';
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke execute on function
  private.can_see_albums(uuid, uuid), private.album_access(uuid, uuid), private.require_album_owner(uuid, uuid)
from public, anon, authenticated;

revoke execute on function
  public.album_list(uuid, uuid), public.album_view(uuid, uuid), public.my_album_photos(uuid, integer),
  public.create_album(uuid, text), public.delete_album(uuid, uuid), public.add_album_photo(uuid, uuid, jsonb),
  public.remove_album_photo(uuid, uuid), public.set_album_password(uuid, uuid, text), public.open_album(uuid, uuid, text)
from public, anon;
grant execute on function
  public.album_list(uuid, uuid), public.album_view(uuid, uuid), public.my_album_photos(uuid, integer),
  public.create_album(uuid, text), public.delete_album(uuid, uuid), public.add_album_photo(uuid, uuid, jsonb),
  public.remove_album_photo(uuid, uuid), public.set_album_password(uuid, uuid, text), public.open_album(uuid, uuid, text)
to authenticated;
