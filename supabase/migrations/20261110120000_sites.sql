-- Step 17a: sites (client decision 261102, Q12). A site is one domain's world: theirl.net is one,
-- aiproduktion.se another. Every community belongs to one site, and its address is unique inside
-- that site only, so theirl.net/demo and aiproduktion.se/demo are two communities.
-- The app finds a request's site from its host (a setting, src/lib/sites.ts) and looks a community
-- up by site + slug. Logins become per site in the next migration.
--
-- Live-safe (docs/prod-db-changes-steps-9-11.md): this only adds. The old build looks a community up
-- by slug alone, which keeps working while no two sites share a slug; its 3-argument
-- create_community and no-argument platform_communities stay until the new build is deployed
-- (supabase/deferred/20261110_drop_siteless_platform.sql).
--
-- WARNING: once two communities share a slug, a build older than this step fails on both of them.
-- Deploy this build to every domain on the database first (docs/prod-db-changes-steps-9-11.md §5).

alter table public.communities
  add column site text not null default 'main' check (site ~ '^[a-z0-9-]{2,40}$');

-- The lookup of every page: one row by (site, slug).
create unique index communities_site_slug_uq on public.communities (site, slug);
alter table public.communities drop constraint if exists communities_slug_key;

-- The platform screen of one site: its communities with their approved members and admins.
create function public.platform_communities(p_site text)
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
  where c.site = p_site and (select private.is_platform_admin())
  order by lower(c.name), c.id
  limit 500
$$;

-- A new community on a site, with empty lists (see the 3-argument version in
-- 20261103120000_feedback_261102.sql). Returns its id.
create function public.create_community(p_site text, p_slug text, p_name text, p_headline text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text := lower(btrim(p_slug));
  v_id uuid;
begin
  perform private.require_platform_admin();
  if p_site is null or p_site !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'unknown site' using errcode = '22023';
  end if;
  if v_slug is null or v_slug !~ '^[a-z0-9-]{2,40}$' or private.reserved_slug(v_slug) then
    raise exception 'the address can''t be used' using errcode = '22023';
  end if;
  insert into public.communities (site, slug, name, headline)
  values (p_site, v_slug, btrim(p_name), coalesce(btrim(p_headline), ''))
  returning id into v_id;
  return v_id;
end
$$;

revoke execute on function public.platform_communities(text), public.create_community(text, text, text, text) from public, anon;
grant execute on function public.platform_communities(text), public.create_community(text, text, text, text) to authenticated;
