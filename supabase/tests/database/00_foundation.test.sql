begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- Extensions
select has_extension('pgcrypto', 'pgcrypto is installed');
select has_extension('pg_trgm', 'pg_trgm is installed');

-- Guardrail for every later step: no table in public may skip RLS.
select is_empty(
  $$ select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every public table has RLS enabled'
);

-- Seed
select results_eq(
  $$ select name from public.communities where slug = 'biking-stockholm' $$,
  $$ values ('Biking Stockholm'::text) $$,
  'Biking Stockholm is seeded'
);

-- Constraints
select throws_ok(
  $$ insert into public.communities (slug, name, headline) values ('Bad Slug!', 'x', 'x') $$,
  '23514', null, 'slug must be lowercase letters, digits and dashes'
);
select throws_ok(
  $$ insert into public.communities (slug, name, headline) values ('biking-stockholm', 'x', 'x') $$,
  '23505', null, 'slug is unique'
);

-- Anyone (not logged in) can read the community
set local role anon;
select results_eq(
  $$ select slug from public.communities where slug = 'biking-stockholm' $$,
  $$ values ('biking-stockholm'::text) $$,
  'anon can read a community'
);
select throws_ok(
  $$ insert into public.communities (slug, name, headline) values ('evil', 'x', 'x') $$,
  '42501', null, 'anon cannot create a community'
);
select throws_ok(
  $$ update public.communities set name = 'Hacked' $$,
  '42501', null, 'anon cannot edit a community'
);
select throws_ok(
  $$ delete from public.communities $$,
  '42501', null, 'anon cannot delete a community'
);

-- A logged-in user can read but not write
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select isnt_empty(
  $$ select 1 from public.communities $$,
  'a logged-in user can read communities'
);
select throws_ok(
  $$ insert into public.communities (slug, name, headline) values ('evil', 'x', 'x') $$,
  '42501', null, 'a logged-in user cannot create a community'
);
-- Only the platform admin may edit (step 1); for anyone else RLS matches no rows.
update public.communities set name = 'Hacked';
select results_eq(
  $$ select count(*)::int from public.communities where name = 'Hacked' $$,
  $$ values (0) $$,
  'a logged-in user cannot edit a community'
);

select * from finish();
rollback;
