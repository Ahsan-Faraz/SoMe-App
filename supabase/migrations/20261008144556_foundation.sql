-- Step 0: foundation. Extensions and the communities table (docs/backend-design.md §4.3).
-- Helper functions (is_member, is_chat_member, ...) are created with the tables they read:
-- members in step 1, chat_members in step 5.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- A community is a closed world at domain.com/{slug}.
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  headline text not null check (char_length(headline) <= 200),
  about text[] not null default '{}' check (cardinality(about) <= 10),
  hero_path text,
  about_path text,
  -- Shown on top of the join application (A25).
  application_text text check (char_length(application_text) <= 4000),
  require_app_image boolean not null default true,
  require_app_text boolean not null default true,
  require_app_names boolean not null default true,
  -- Community-level "profile state" labels (D24).
  state_label_1 text check (char_length(state_label_1) <= 40),
  state_label_2 text check (char_length(state_label_2) <= 40),
  state_label_3 text check (char_length(state_label_3) <= 40),
  default_locale text not null default 'en' check (default_locale ~ '^[a-z]{2}$'),
  created_at timestamptz not null default now()
);

alter table public.communities enable row level security;

-- Anyone can read a community: the start page is public.
-- Writes are the platform admin's; that policy arrives with platform_admins in step 1.
revoke all on public.communities from anon, authenticated;
grant select on public.communities to anon, authenticated;

create policy communities_read on public.communities
  for select to anon, authenticated
  using (true);

-- The first community. Images are static assets in public/ until Storage arrives (step 3).
insert into public.communities (
  slug, name, headline, about, hero_path, about_path,
  application_text, state_label_1, state_label_2, state_label_3
) values (
  'biking-stockholm',
  'Biking Stockholm',
  'Rides, routes and people who love two wheels.',
  array[
    'We are a community for everyone who rides in and around Stockholm — road, gravel and mountain bike.',
    'Members meet for weekly rides, share routes and help each other with gear. Every member has a real profile.',
    'Join to see upcoming rides in the group calendars and get to know the people you ride with.'
  ],
  '/community/hero.png',
  '/community/ride.png',
  'Tell us who you are and how you ride. An admin reads every application and replies in a chat.',
  'Paid',
  'Locker number',
  'Attended'
);
