-- Step 20b (client guide 261123): log in and join on the main domain (theirl.net/login, /join),
-- then pick a community (/communities). Only adds: one defaulted column, two functions, and two
-- functions replaced with the same arguments and results (reserved_slug, save_community_start).
--
-- A login belongs to a site (20261110130000_logins.sql) and may have no community yet: the sign-up
-- trigger (handle_new_user) already makes only the logins row when no community is given. Joining a
-- community later is join_community, as for a login that joins a second community today.

-- A community the admin has made "visible": listed on its site's /communities for logins that
-- aren't members yet. Off by default, so nothing is listed until its admin chooses it.
alter table public.communities add column listed boolean not null default false;

-- The main domain's own addresses, and the WordPress site that will share the domain, can never be
-- a community's address. Same arguments and result.
create or replace function private.reserved_slug(p_slug text) returns boolean
language sql immutable set search_path = '' as $$
  select p_slug in (
    'auth', 'api', 'platform', 'login', 'join', 'communities', 'open',
    'wp-admin', 'wp-content', 'wp-includes', 'wp-json', 'home', 'pricing', 'about', 'contact', 'cookies', 'get-started'
  )
$$;

-- Join on the main domain, server only: like join_prepare without a community. Removes an earlier
-- sign-up of this email on this site that was never confirmed (so it can start again), then
-- returns the login behind the email, if there is one. One row by (site, email).
create function public.site_join_prepare(p_site text, p_email text)
returns table (user_id uuid, auth_email text)
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_unconfirmed uuid;
begin
  select l.user_id into v_unconfirmed
  from public.logins l join auth.users u on u.id = l.user_id
  where l.site = p_site and l.email = v_email and u.email_confirmed_at is null;
  if v_unconfirmed is not null then
    delete from auth.users u where u.id = v_unconfirmed;
  end if;

  return query
  select l.user_id, u.email::text
  from public.logins l join auth.users u on u.id = l.user_id
  where l.site = p_site and l.email = v_email;
end
$$;

-- /communities: the caller's communities on this site (with their state), then the visible ones
-- they have no account in. A rejected or removed account is in neither list. Nothing for a login of
-- another site. Communities are made by the platform admin, so a site has few; capped anyway.
create function public.site_communities(p_site text)
returns table (slug text, name text, headline text, state text)
language sql stable security definer set search_path = '' as $$
  select c.slug, c.name, c.headline, m.state::text
  from public.communities c
  left join public.members m on m.community_id = c.id and m.user_id = (select auth.uid())
  where c.site = p_site
    and exists (select 1 from public.logins l where l.user_id = (select auth.uid()) and l.site = p_site)
    and (m.state in ('profile', 'applied', 'approved') or (m.user_id is null and c.listed))
  order by m.user_id is null, c.name
  limit 200
$$;

-- As in 20261124120000_start_page.sql, plus `listed` (optional: left out, it keeps its value).
create or replace function public.save_community_start(p_community uuid, p_start jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_title text := private.text_of(p_start, 'title');
  v_headline text := btrim(coalesce(p_start ->> 'headline', ''));
  v_about jsonb := p_start -> 'about';
  v_paragraphs text[];
  v_image text := p_start ->> 'image';
  v_old text;
begin
  perform private.require_community_admin(p_community);
  if jsonb_typeof(p_start) is distinct from 'object'
    or jsonb_typeof(p_start -> 'headline') is distinct from 'string'
    or jsonb_typeof(v_about) is distinct from 'array'
    or (p_start ? 'title' and jsonb_typeof(p_start -> 'title') not in ('string', 'null'))
    or (p_start ? 'image' and jsonb_typeof(p_start -> 'image') not in ('string', 'null'))
    or (p_start ? 'listed' and jsonb_typeof(p_start -> 'listed') is distinct from 'boolean')
    or exists (select 1 from jsonb_array_elements(v_about) as a where jsonb_typeof(a) is distinct from 'string') then
    raise exception 'start page is incomplete' using errcode = '22023';
  end if;

  select coalesce(array_agg(p order by n), '{}') into v_paragraphs
  from jsonb_array_elements_text(v_about) with ordinality as a (raw, n)
  cross join lateral (select btrim(a.raw) as p) as t
  where t.p <> '';

  if char_length(v_title) > 120 or char_length(v_headline) > 200
    or cardinality(v_paragraphs) > 10
    or coalesce((select sum(char_length(p)) from unnest(v_paragraphs) as p), 0) > 4000 then
    raise exception 'start page text is too long' using errcode = '22001';
  end if;

  if v_image is not null and (
    v_image !~ ('^' || p_community || '/start/[0-9a-f-]{36}\.(webp|jpg)$')
    or not exists (select 1 from storage.objects where bucket_id = 'profile' and name = v_image)
  ) then
    raise exception 'start page image not found' using errcode = '22023';
  end if;

  select hero_path into v_old from public.communities where id = p_community for update;

  update public.communities
  set start_title = v_title,
      headline = v_headline,
      about = v_paragraphs,
      hero_path = case when p_start ? 'image' then v_image else hero_path end,
      listed = coalesce((p_start ->> 'listed')::boolean, listed)
  where id = p_community;

  if p_start ? 'image' and v_old is distinct from v_image and v_old like p_community || '/start/%' then
    return v_old;
  end if;
  return null;
end
$$;

revoke execute on function public.site_join_prepare(text, text), public.site_communities(text) from public, anon, authenticated;
grant execute on function public.site_join_prepare(text, text) to service_role;
grant execute on function public.site_communities(text) to authenticated;
