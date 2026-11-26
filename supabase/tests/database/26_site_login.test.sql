begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Fixtures -------------------------------------------------------------------------------------
create temp table ids as select
  (select id from public.communities where slug = 'biking-stockholm' order by site limit 1) as biking,
  (select site from public.communities where slug = 'biking-stockholm' order by site limit 1) as site,
  'a2600000-0000-4000-8000-00000000000a'::uuid as anna, -- login only (joined on the main domain)
  'a2600000-0000-4000-8000-00000000000b'::uuid as bert, -- approved member of biking
  'a2600000-0000-4000-8000-00000000000c'::uuid as carl, -- rejected in biking
  'a2600000-0000-4000-8000-00000000000d'::uuid as dina, -- login on another site
  'a2600000-0000-4000-8000-00000000000e'::uuid as erik; -- unconfirmed sign-up
grant select on ids to anon, authenticated;

update public.communities set privacy_version = 'test';
update public.communities set listed = false where id = (select biking from ids);
insert into public.communities (site, slug, name, headline, listed, privacy_version)
select site, 'test-listed-26', 'Test Listed 26', 'A visible community', true, 'test' from ids;
insert into public.communities (site, slug, name, headline, listed, privacy_version)
select site, 'test-hidden-26', 'Test Hidden 26', 'Not visible', false, 'test' from ids;

-- Logins without a community, as the main domain's join makes them (site + login_email only).
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select u.id, u.id || '@' || u.site || '.login.invalid', u.confirmed,
  jsonb_build_object('site', u.site, 'login_email', u.name || '26@test.invalid')
from ids cross join lateral (values
  (ids.anna, 'anna', ids.site, now()), (ids.dina, 'dina', 'test-other-26', now()), (ids.erik, 'erik', ids.site, null::timestamptz)
) as u (id, name, site, confirmed);
-- Members of biking, made the usual way (the join form gives the community).
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select u.id, u.name || '26@test.invalid', now(),
  jsonb_build_object('community_id', ids.biking, 'username', 'Test ' || u.name, 'consents', '{"privacy": "test", "age_18": true}'::jsonb)
from ids cross join lateral (values (ids.bert, 'bert'), (ids.carl, 'carl')) as u (id, name);
update public.members set state = 'approved' where user_id = (select bert from ids);
update public.members set state = 'rejected' where user_id = (select carl from ids);

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.list(p_user uuid) returns text language plpgsql as $$
begin
  perform pg_temp.as_user(p_user);
  return (select string_agg(slug || ':' || coalesce(state, '-'), ',') from public.site_communities((select site from ids))
          where slug in ('biking-stockholm', 'test-listed-26', 'test-hidden-26'));
end
$$;

-- A login without a community -------------------------------------------------------------------
select is((select count(*)::int from public.logins l, ids where l.user_id = ids.anna and l.site = ids.site), 1, 'a main-domain sign-up makes a login');
select is((select count(*)::int from public.members m, ids where m.user_id = ids.anna), 0, 'and no account in any community');

-- /communities ----------------------------------------------------------------------------------
set local role authenticated;
select is(pg_temp.list((select anna from ids)), 'test-listed-26:-', 'a login with no accounts sees only the visible communities');
select is(pg_temp.list((select bert from ids)), 'biking-stockholm:approved,test-listed-26:-', 'a member sees their community first, then the visible ones');
select is(pg_temp.list((select carl from ids)), 'test-listed-26:-', 'a rejected account is not listed, and the community not offered again');
select is(pg_temp.list((select dina from ids)), null, 'a login of another site sees nothing here');

-- Joining a visible community from there: the usual join_community.
select pg_temp.as_user(anna) from ids;
select lives_ok(
  $$ select public.join_community((select id from public.communities c, ids where c.site = ids.site and c.slug = 'test-listed-26'), 'Test anna', '{"privacy": "test"}'::jsonb) $$,
  'a login joins a visible community'
);
select is(pg_temp.list((select anna from ids)), 'test-listed-26:profile', 'which then shows as theirs, with its state');
reset role;

-- Who may call what ----------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.site_communities('main') $$, '42501', null, 'site_communities needs a login');
reset role;
set local role authenticated;
select pg_temp.as_user(anna) from ids;
select throws_ok($$ select * from public.site_join_prepare('main', 'x@test.invalid') $$, '42501', null, 'site_join_prepare is server only');
reset role;

-- site_join_prepare ----------------------------------------------------------------------------
select results_eq(
  $$ select user_id from public.site_join_prepare((select site from ids), 'ANNA26@test.invalid ') $$,
  $$ select anna from ids $$,
  'finds a confirmed login by site and email, in any case'
);
select is((select count(*)::int from public.site_join_prepare('test-other-26', 'anna26@test.invalid')), 0, 'not on another site');
select is((select count(*)::int from public.site_join_prepare((select site from ids), 'erik26@test.invalid')), 0, 'an unconfirmed sign-up is not returned');
select is((select count(*)::int from auth.users u, ids where u.id = ids.erik), 0, 'and is removed, so it can start again');

-- Visible switch and reserved addresses -------------------------------------------------------
update public.members set role = 'admin' where user_id = (select bert from ids);
set local role authenticated;
select pg_temp.as_user(bert) from ids;
select lives_ok(
  $$ select public.save_community_start((select biking from ids), '{"headline": "Rides", "about": [], "listed": true}'::jsonb) $$,
  'the admin makes the community visible'
);
reset role;
select is((select listed from public.communities c, ids where c.id = ids.biking), true, 'listed is saved');
select ok(private.reserved_slug('login') and private.reserved_slug('communities') and private.reserved_slug('wp-admin'), 'main-domain and WordPress addresses are reserved');

select * from finish();
rollback;
