-- Step 17d: the login lookups read their indexes (scripts/speed/18_logins.sql, 20,000 logins).
-- Same arguments and results as in 20261110130000_logins.sql.
-- 1. login_lookup chose between email and username with a CASE in its WHERE, which no index can
--    serve: it read every login (20 ms). Now one branch per kind, each on its unique index
--    (logins_site_email_uq, members_username_uq).
-- 2. join_prepare removed an unconfirmed sign-up with a join the planner started from auth.users
--    (210 ms). Now it finds the login by (site, email) first and deletes that one row by id.

create or replace function public.login_lookup(p_site text, p_community uuid, p_login text)
returns table (user_id uuid, auth_email text, email text, confirmed boolean)
language sql stable security definer set search_path = '' as $$
  select l.user_id, u.email::text, l.email, u.email_confirmed_at is not null
  from public.logins l
  join auth.users u on u.id = l.user_id
  where strpos(p_login, '@') > 0 and l.site = p_site and l.email = lower(btrim(p_login))
  union all
  select l.user_id, u.email::text, l.email, u.email_confirmed_at is not null
  from public.members m
  join public.logins l on l.user_id = m.user_id and l.site = p_site
  join auth.users u on u.id = l.user_id
  where strpos(p_login, '@') = 0
    and m.community_id = p_community and lower(m.username) = lower(btrim(p_login)) and not m.is_system
$$;

create or replace function public.join_prepare(p_site text, p_community uuid, p_username text, p_email text)
returns table (username_taken boolean, user_id uuid, auth_email text)
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_unconfirmed uuid;
begin
  if not exists (select 1 from public.communities c where c.id = p_community and c.site = p_site) then
    raise exception 'no such community on this site' using errcode = '22023';
  end if;
  select l.user_id into v_unconfirmed
  from public.logins l join auth.users u on u.id = l.user_id
  where l.site = p_site and l.email = v_email and u.email_confirmed_at is null;
  if v_unconfirmed is not null then
    delete from auth.users u where u.id = v_unconfirmed;
  end if;

  return query
  select
    exists (select 1 from public.members m where m.community_id = p_community and lower(m.username) = lower(btrim(p_username))),
    l.user_id, u.email::text
  from (select 1) as one
  left join public.logins l on l.site = p_site and l.email = v_email
  left join auth.users u on u.id = l.user_id;
end
$$;
