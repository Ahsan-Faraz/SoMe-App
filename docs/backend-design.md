# SoMe — Backend Design

Status: design, ready to build. Date: 2026-10-06.
Replaces `docs/Backend-Implementation-Plan.md` (29 Sep), which was written before Peter's answers. That file stays for history only.

Sources: spec v0.33, the kick-off call transcript, mockups 260922, Peter's answers doc (261004), his drafts A19–A33 (PDF 261004), his annotated screenshots (Oct 2026), `.cursor/rules/*`, and the current frontend in `src/`.

How to read this: every section starts with a short plain-English summary. The detail below it is for the developer building that part. Each section stands alone.

---

## 1. Overview

**What we are building.** A Wire-like chat app with real member profiles, where every community lives in its own closed world. The first community is Biking Stockholm. Later communities will look completely different (other profile fields, other choices), so **nothing is hard-coded to biking**. The community admin builds the profile fields in the app.

**The two goals that drive every decision:**

1. **Dynamic.** Profile fields, Status choices, District list, group settings and labels all live in the database as data, not in code. A new community needs no developer.
2. **Fast, with no compromise.** One database trip per screen, everything indexed, chat messages pushed live, small JavaScript downloads. Targets in §11.

**Stack.** Only two services, both in Stockholm:

| Part | Service | What it does |
|---|---|---|
| App + server | Next.js 16 on Vercel (functions in `arn1`, Stockholm) | Screens, Server Actions for privileged work |
| Database | Supabase Postgres (`eu-north-1`, Stockholm) | All data, security rules (RLS), database functions (RPCs) |
| Login | Supabase Auth | Email + password, email verification, password reset |
| Files | Supabase Storage | Photos (private and public buckets) |
| Live chat | Supabase Realtime (Broadcast over WebSockets) | Pushes new messages, edits, reactions to open chats |
| Email | Supabase Auth emails + an EU SMTP provider | Verify email, password reset, "you are approved" |

No Redis, queues, search service, or third-party realtime. §8 explains why none is needed.

**How a request flows:**

```
Phone (PWA)
  ├─ reads: Server Component → one RPC/select → Postgres (Stockholm)
  ├─ hot writes (send, react, mark read): browser → Postgres RPC directly (RLS checks it)
  ├─ privileged writes (approve, group admin, album password, login): Server Action → RPC
  └─ live updates: WebSocket → Supabase Realtime → only the chat that is open
```

---

## 2. Decisions (from Peter's answers)

**In plain English:** these are fixed. Build to them.

| # | Topic | Decision |
|---|---|---|
| D1 | Profile field types | All: short text, long text, yes/no, pick one, pick several, number, date, photo |
| D2 | Built-in fields (not in the builder) | **Status** and **District**. Their choices are set per community. |
| D3 | Status choices (Biking Stockholm) | Man, Woman, Other, Couple MF, Couple MM, Couple FF |
| D4 | Status drives the profile | Each field can be limited to some Statuses. Status sits at the top of the profile. |
| D5 | Looking for | Multi-select of the same Status choices, on profiles and ads |
| D6 | Search | Admin chooses which fields are searchable |
| D7 | Age | From birth date |
| D8 | Location | District (from a list) + Place (free text). Km distance maybe later. |
| D9 | Groups | Community admin, and members given "group create/admin rights", can create groups |
| D10 | Group admins | One per group for now. Built so more can be allowed later. |
| D11 | Approval | Community admin approves new members (application queue). Group admins approve group applications. |
| D12 | Leave a DM | Two options: "Keep chat, block writing" or "Delete chat (for both), block user from DM" |
| D13 | Blocking | Blocks messages **and** hides your profile from that person |
| D14 | Messages | Kept forever for now |
| D15 | Ads | Separate Ads tab stays. Bottom menu: Chats / Profiles / Ads. |
| D16 | Photos | Any photo anywhere can be "Real" (in-app camera + date). Gallery photos allowed everywhere, never labelled Real. |
| D17 | Accounts | Separate account per community (see D17 note below) |
| D18 | Wording | "Verified" is called **"Real"** everywhere |
| D19 | Username | Set once at sign-up, not editable afterwards (it is the name shown in chats) |
| D20 | Reactions | One reaction per person per post, changeable |
| D21 | Profile score | Shown and filterable now. Reputation is later (removed from the profile for now). |
| D22 | Visibility | "Profile visible in search Y/N" per member; "Group visible in search" per group |
| D23 | Linked profiles | A member can link up to 3 other profiles to theirs |
| D24 | Admin data per member | Real name 1 and 2, three numbered "profile state" fields with labels set per group/community, notes. Saved separately per group and for the community. |
| D25 | Translations | Later, but the design is ready now (§10) |

**D17 note (separate accounts).** Supabase Auth allows one password per email. So each email has **one login**, and each community gets its own **member account**: its own username, profile, photos, chats, blocks and admin data. Communities never see each other. Default: the same email uses the same password in every community it joins (open question Q8).

---

## 3. Roles and permissions

**In plain English:** five kinds of people. The database enforces what each can do, so hiding a button is never the only protection.

| Role | How you get it | Can do |
|---|---|---|
| **Platform admin** (Peter) | Row in `platform_admins` | Create communities, appoint community admins. Uses the in-app admin screens or the Supabase dashboard. |
| **Community admin** | `members.role = 'admin'` | Everything in the community: field builder, Status/District lists, approve members, all groups, give group rights, statistics, delete any post |
| **Group admin** | `chat_members.role = 'admin'` on a group | Edit their group and its settings, approve group applications, member list + admin data for their group, calendar, delete posts in their group, "Add to groups" for their own groups only |
| **Member (approved)** | `members.state = 'approved'` | Everything a normal user does. Create groups only if `can_create_groups`. |
| **Applicant (not yet approved)** | `members.state in ('profile','applied')` | Edit own profile, fill in the application, chat with the admin **only if the admin wrote first**. Nothing else. |

The **No-reply account** is a system member per community (`members.is_system = true`). It sends automatic DMs such as "You are now a member of the group". Nobody logs in as it.

---

## 4. Database

### 4.1 Conventions

**In plain English:** the same rules for every table, so nothing surprises a developer.

- UUID primary keys (`gen_random_uuid()`), except `messages` which uses `(chat_id, seq)`.
- **Every table has `community_id`**, including child tables. Security rules and queries can then filter on one indexed column without joining up a chain. Communities never leak into each other.
- Text the admin types that users read (field labels, choices) is stored as `jsonb` like `{"en": "Bike type"}`, ready for a second language (§10).
- Choice lists are `text` + `check (x in (...))`, not Postgres enum types, so adding a value is a one-line migration.
- Length limits are `check` constraints. The database is the last line of defence; a direct browser call can't bypass them.
- `timestamptz` everywhere, `created_at default now()`.
- RLS (row-level security) is on for **every** table. Policies use `(select auth.uid())`.
- A few `security definer` helper functions are the only places RLS is deliberately crossed: `is_member(community)`, `is_approved(community)`, `is_community_admin(community)`, `is_chat_member(chat)`, `is_group_admin(chat)`. All `stable`, `search_path = ''`.
- No `select *`, no `count: 'exact'` on hot paths, no `OFFSET`. Every list has a `limit` and keyset paging.

### 4.2 Tables at a glance

| Area | Tables |
|---|---|
| Platform & communities | `platform_admins`, `communities`, `community_options` |
| Members & approval | `members`, `applications`, `admin_records` |
| Profile builder & answers | `profile_fields`, `profile_field_options`, `profile_values`, `profile_value_options`, `profile_links` |
| Photos & albums | `photos`, `albums`, `album_photos` |
| Chats & groups | `chats`, `chat_members`, `messages`, `reactions`, `blocks`, `group_info_posts`, `events` |
| Private | `notes` |
| Ads | `ads` |

24 tables, 3 storage buckets. Every table maps to a confirmed feature.

### 4.3 Platform and communities

**In plain English:** a community is a closed world at `domain.com/slug`. Its Status and District choices are rows, so each community can have its own.

```sql
platform_admins (
  user_id uuid primary key references auth.users on delete cascade
)

communities (
  id uuid pk,
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),       -- domain.com/{slug}
  name text not null, headline text not null, about text[] not null default '{}',
  hero_path text, about_path text,
  application_text text check (char_length(application_text) <= 4000), -- shown on top of the join application (A25)
  require_app_image boolean not null default true,                     -- verification photo required
  require_app_text  boolean not null default true,
  require_app_names boolean not null default true,
  state_label_1 text, state_label_2 text, state_label_3 text,          -- community-level "profile state" labels (D24)
  default_locale text not null default 'en',
  created_at timestamptz
)

-- Status and District choices, per community (D2, D3).
community_options (
  id uuid pk,
  community_id uuid not null references communities on delete cascade,
  list text not null check (list in ('status','district')),
  label jsonb not null,                       -- {"en": "Couple MF"}
  people smallint not null default 1 check (people in (1,2)),  -- status only: couples = 2 (drives per-person fields)
  position smallint not null,
  active boolean not null default true        -- retire a choice without breaking old profiles
)
index community_options_list on community_options (community_id, list, position);
```

### 4.4 Members, applications and admin data

**In plain English:**

- A **member** is one person's account in one community: username, Status, District, Place, birth date(s), photos, score, visibility.
- An **application** is a request to join the community or a group. It goes into the admin's queue (Peter's process, A24/A25).
- **Admin records** are the admin's private notes on a member: real names, the three numbered "profile state" fields (e.g. Paid amount, Locker nr) and notes. They are kept separately for the community and for each group (Peter's A21/A30 drafts).

```sql
members (
  community_id uuid references communities on delete cascade,
  user_id uuid references auth.users on delete cascade,
  username text not null check (char_length(username) between 3 and 32),  -- fixed after sign-up (D19)
  role text not null default 'member' check (role in ('member','admin')),
  can_create_groups boolean not null default false,                       -- "Group create/admin rights" (D9)
  state text not null default 'profile'
    check (state in ('profile','applied','approved','rejected','removed')),
  is_system boolean not null default false,                               -- the No-reply account
  -- built-in profile fields (indexed columns, so search is fast)
  status_id uuid references community_options,                           -- D2/D3
  looking_for uuid[] not null default '{}',                               -- status option ids (D5)
  district_id uuid references community_options,
  place text check (char_length(place) <= 80),
  birth_date date, birth_date_2 date,                                     -- _2 used when status.people = 2
  visible_in_search boolean not null default true,                        -- D22
  score smallint not null default 0 check (score between 0 and 100),     -- D21, recomputed on save
  icon_photo_id uuid, main_photo_ids uuid[] not null default '{}' check (cardinality(main_photo_ids) <= 3),
  search_filter jsonb, ad_filter jsonb,                                   -- filters remembered on the account
  locale text,                                                            -- null = community default
  last_login_at timestamptz, created_at timestamptz,
  primary key (community_id, user_id)
)
unique index members_username_uq on members (community_id, lower(username));
index members_user        on members (user_id, community_id);
index members_state       on members (community_id, state);               -- admin queue counts
index members_district    on members (community_id, district_id) where state = 'approved';
index members_birth       on members (community_id, birth_date)  where state = 'approved';
index members_score       on members (community_id, score desc)  where state = 'approved';
index members_looking     on members using gin (looking_for);
index members_place_trgm  on members using gin (place gin_trgm_ops);     -- "Place" substring search

applications (
  id uuid pk,
  community_id uuid not null,
  user_id uuid not null,
  chat_id uuid references chats on delete cascade,      -- null = joining the community, else a group
  photo_id uuid references photos,                       -- application image ("Real" when taken in app)
  message text check (char_length(message) <= 4000),
  real_name_1 text check (char_length(real_name_1) <= 80),
  real_name_2 text check (char_length(real_name_2) <= 80),
  status text not null default 'pending' check (status in ('pending','approved','later','rejected')),
  decided_by uuid, decided_at timestamptz, created_at timestamptz,
  foreign key (community_id, user_id) references members on delete cascade
)
unique index applications_open on applications (community_id, user_id, coalesce(chat_id, community_id))
  where status in ('pending','later');                   -- one open application per target ("Apply" dimmed)
index applications_queue on applications (community_id, chat_id, status, created_at);

-- Admin-only data about a member. scope_id = community_id for the community level, else the group's chat_id.
admin_records (
  scope_id uuid not null,
  community_id uuid not null,
  user_id uuid not null,
  real_name_1 text, real_name_2 text,                   -- copied from the approved application, editable
  state_1 integer, state_2 integer, state_3 integer,    -- labels come from communities/chats state_label_N
  notes text check (char_length(notes) <= 4000),
  updated_at timestamptz,
  primary key (scope_id, user_id),
  foreign key (community_id, user_id) references members on delete cascade
)
```

**Why real names live in `admin_records` and `applications`, not on `members`:** RLS can't hide single columns cheaply. Keeping them in admin-only tables means a normal member can never read them, whatever query they send (open question Q6 can loosen this later).

### 4.5 Profile builder and answers

**In plain English:**

- The admin creates **fields** (e.g. "Bike type: pick one: Gravel / Road / MTB").
- Each field says which Statuses see it, whether it's searchable, whether it's shown on the profile card, and whether couples answer it **twice** (one answer per person).
- Answers are stored one row each, in a column of the right type, so number and date searches use indexes.
- "Pick one" and "pick several" answers go in their own small table, so option filters are fast.

```sql
profile_fields (
  id uuid pk,
  community_id uuid not null references communities on delete cascade,
  key text not null,                                   -- stable id for code/filters, e.g. 'bike_type'
  label jsonb not null,                                -- {"en": "Bike type"}
  kind text not null check (kind in
    ('short_text','long_text','yes_no','pick_one','pick_several','number','date','photo')),
  required boolean not null default false,             -- must be filled before applying
  searchable boolean not null default false,           -- D6: shown in the filter form
  on_card boolean not null default false,              -- shown on the Profiles list card
  per_person boolean not null default false,           -- couples answer twice (Q3 default)
  for_statuses uuid[],                                 -- null = every status (D4)
  max_length int check (max_length between 1 and 32000),
  position smallint not null,
  active boolean not null default true,                -- hide without deleting answers
  unique (community_id, key)
)

profile_field_options (
  id uuid pk,
  field_id uuid not null references profile_fields on delete cascade,
  community_id uuid not null,
  label jsonb not null, position smallint not null, active boolean not null default true
)

-- One row per answer. person = 1, or 2 for the second person of a couple.
profile_values (
  community_id uuid not null, user_id uuid not null,
  field_id uuid not null references profile_fields on delete cascade,
  person smallint not null default 1 check (person in (1,2)),
  value_text text check (char_length(value_text) <= 32000),   -- short/long text
  value_num  numeric,                                         -- number
  value_bool boolean,                                         -- yes/no
  value_date date,                                            -- date
  value_photo_id uuid references photos on delete set null,   -- photo
  primary key (field_id, user_id, person),
  foreign key (community_id, user_id) references members on delete cascade
)
index profile_values_member on profile_values (community_id, user_id);
index profile_values_num    on profile_values (field_id, value_num)  where value_num  is not null;
index profile_values_date   on profile_values (field_id, value_date) where value_date is not null;
index profile_values_bool   on profile_values (field_id, value_bool) where value_bool is not null;
index profile_values_text   on profile_values using gin (value_text gin_trgm_ops);  -- "text in a field"

-- Pick one / pick several answers.
profile_value_options (
  community_id uuid not null, user_id uuid not null,
  field_id uuid not null, person smallint not null default 1,
  option_id uuid not null references profile_field_options on delete cascade,
  primary key (field_id, user_id, person, option_id),
  foreign key (community_id, user_id) references members on delete cascade
)
index profile_value_options_opt on profile_value_options (option_id, user_id);

-- Linked profiles (A32), max 3, enforced by a trigger.
profile_links (
  community_id uuid not null, user_id uuid not null, linked_user_id uuid not null,
  state text not null default 'pending' check (state in ('pending','accepted')),  -- Q7 default: must accept
  created_at timestamptz,
  primary key (community_id, user_id, linked_user_id),
  check (user_id <> linked_user_id)
)
```

**Profile score (D21).** `members.score` is a stored number, recomputed inside `save_profile` and when photos change, never on read. That keeps "Profile score min" a plain indexed filter. Default rule until Peter decides (Q2), capped at 100:

- +10 for each long-text field with at least 200 characters (max +40)
- +10 for having a main photo
- +30 more if that main photo is Real
- +20 if every required field is filled

The rule lives in one function, `compute_score(community, user)`, so changing it is one migration.

### 4.6 Photos and albums

**In plain English:**

- Every photo is a row in `photos`, wherever it's used: profile, album, chat, ad, application.
- Each photo records whether it is **Real** (taken with the in-app camera) and when it was taken.
- Reusing a photo "From profile/album" in a chat or ad **copies the file**, so a locked album can never leak through a chat.

```sql
photos (
  id uuid pk,
  community_id uuid not null, owner_id uuid not null,
  bucket text not null check (bucket in ('profile','private')),
  path text not null, thumb_path text not null,        -- {community}/{owner}/{uuid}.webp and _t.webp
  width int, height int,
  is_real boolean not null default false,              -- D16: in-app camera. A claim, not proof.
  taken_at timestamptz,                                -- camera time for Real photos
  purpose text not null check (purpose in ('profile','album','chat','ad','application')),
  created_at timestamptz,
  foreign key (community_id, owner_id) references members on delete cascade
)
index photos_owner on photos (community_id, owner_id, created_at desc);

albums (
  id uuid pk, community_id uuid not null, owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  password_hash text,                                  -- crypt(pw, gen_salt('bf',10)); never readable by clients
  position smallint, created_at timestamptz,
  foreign key (community_id, owner_id) references members on delete cascade
)
index albums_owner on albums (community_id, owner_id);

album_photos (
  album_id uuid references albums on delete cascade,
  photo_id uuid references photos on delete cascade,
  community_id uuid not null, position int,
  primary key (album_id, photo_id)
)
```

Locked albums never show a cover photo in the list (Peter: "folder icon"). The list query returns `has_password` and no photo for them.

### 4.7 Chats, groups and messages

**In plain English:**

- A DM and a group are both a **chat**. A group just has a name and settings.
- Messages are numbered per chat (1, 2, 3…), which makes paging and unread counts cheap.
- A comment is a message that points at the post it comments on, and keeps a short copy (snippet) of that post.
- Each person has at most **one** reaction per post (D20).

```sql
chats (
  id uuid pk, community_id uuid not null references communities on delete cascade,
  kind text not null check (kind in ('dm','group')),
  -- group fields
  name text check (kind = 'dm' or char_length(name) between 1 and 80),
  headline text check (char_length(headline) <= 200),
  application_text text check (char_length(application_text) <= 4000),  -- top of the group application form
  -- group settings (A10)
  history boolean not null default true,              -- new members see history
  member_list boolean not null default true,          -- members see user list and number of users
  allow_posting boolean not null default true,
  allow_commenting boolean not null default true,
  allow_reactions boolean not null default true,
  allow_post_editing boolean not null default true,
  direct_join boolean not null default false,
  calendar boolean not null default true,
  show_info_posts boolean not null default true,
  visible_in_search boolean not null default true,    -- D22
  require_app_image boolean not null default false,   -- what is required to apply
  require_app_text boolean not null default false,
  require_app_names boolean not null default false,
  state_label_1 text, state_label_2 text, state_label_3 text,   -- e.g. "Application status", "Paid amount"
  -- dm fields
  dm_user_a uuid, dm_user_b uuid,                     -- a < b
  -- list bookkeeping
  last_seq bigint not null default 0,
  last_message_at timestamptz, last_message_preview text,
  created_by uuid not null, created_at timestamptz,
  check ((kind = 'dm') = (dm_user_a is not null and dm_user_b is not null and dm_user_a < dm_user_b))
)
unique index chats_dm_uq on chats (community_id, dm_user_a, dm_user_b) where kind = 'dm';
index chats_recent on chats (community_id, last_message_at desc);
index chats_name_trgm on chats using gin (name gin_trgm_ops) where kind = 'group';  -- "Find new group"

chat_members (
  chat_id uuid references chats on delete cascade,
  user_id uuid not null, community_id uuid not null,
  role text not null default 'member' check (role in ('member','admin')),
  last_read_seq bigint not null default 0,
  visible_from_seq bigint not null default 0,         -- history = off: last_seq at join
  joined_at timestamptz,
  primary key (chat_id, user_id),
  foreign key (community_id, user_id) references members on delete cascade
)
index chat_members_user on chat_members (user_id, community_id);
unique index chat_one_admin on chat_members (chat_id) where role = 'admin';   -- D10; drop to allow co-admins

messages (
  chat_id uuid references chats on delete cascade,
  seq bigint not null,
  community_id uuid not null,
  author_id uuid not null,
  kind text not null default 'user' check (kind in ('user','system')),
  body text check (char_length(body) <= 8000),
  image_path text, thumb_path text, image_is_real boolean not null default false, image_taken_at timestamptz,
  reply_to_seq bigint,                                -- comment on that post
  reply_snippet text,                                 -- "Anna Lind: Meeting at Slussen…" copied at send
  reactions jsonb not null default '{}',              -- {"👍": 3, "🙏": 1}, kept by trigger
  edited_at timestamptz, created_at timestamptz not null default now(),
  primary key (chat_id, seq),
  foreign key (chat_id, reply_to_seq) references messages (chat_id, seq) on delete cascade,  -- deleting a post deletes its comments
  check (body is not null or image_path is not null)
)

reactions (
  chat_id uuid, seq bigint, user_id uuid, community_id uuid not null,
  emoji text not null check (char_length(emoji) <= 16),   -- any emoji (+ picker)
  created_at timestamptz,
  primary key (chat_id, seq, user_id),                    -- one per person (D20); change = update
  foreign key (chat_id, seq) references messages on delete cascade
)

blocks (
  community_id uuid, blocker_id uuid, blocked_id uuid, created_at timestamptz,
  primary key (community_id, blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
)
index blocks_blocked on blocks (community_id, blocked_id);

group_info_posts (
  chat_id uuid references chats on delete cascade, n smallint check (n between 1 and 3),
  community_id uuid not null,
  headline text not null check (char_length(headline) <= 120),
  body text not null check (char_length(body) <= 32000),
  primary key (chat_id, n)
)

events (
  id uuid pk, chat_id uuid not null references chats on delete cascade, community_id uuid not null,
  on_date date not null,
  headline text not null check (char_length(headline) <= 120),
  body text check (char_length(body) <= 4000),
  created_by uuid not null,                            -- "DM Admin" button opens a DM with this person
  created_at timestamptz, updated_at timestamptz
)
index events_chat_date on events (chat_id, on_date);
```

**Why `messages.reactions` is stored on the message:** a chat page loads 30 messages. Keeping the counts on the message means no counting query per page. A trigger on `reactions` keeps the counts right. "Mine" comes from one lookup of the viewer's reactions for those 30 messages.

### 4.8 Private notes and stars

**In plain English:** your notes and 1–5 stars about another member. Only you can ever read them, not even admins. The same notes open from their profile and from your DM with them. Groups have no notes (Peter: the star is for DMs only).

```sql
notes (
  author_id uuid not null, community_id uuid not null, target_user_id uuid not null,
  body text not null default '' check (char_length(body) <= 32000),
  stars smallint check (stars between 1 and 5),
  updated_at timestamptz,
  primary key (author_id, community_id, target_user_id)
)
index notes_stars on notes (author_id, community_id, stars);   -- "My stars min–max" filter
```

### 4.9 Ads

**In plain English:** an ad belongs to a member. Age, Status and score are **not** copied onto the ad. They are read from the author's profile, so they can never be out of date.

```sql
ads (
  id uuid pk, community_id uuid not null, user_id uuid not null,
  looking_for uuid[] not null default '{}',             -- status option ids (multi)
  headline text not null check (char_length(headline) <= 120),
  body text check (char_length(body) <= 4000),
  district_id uuid references community_options,
  place text check (char_length(place) <= 80),
  photo_id uuid references photos on delete set null,   -- camera, upload, or "From profile/album" (copied)
  published_at timestamptz not null default now(), updated_at timestamptz,
  foreign key (community_id, user_id) references members on delete cascade
)
index ads_recent  on ads (community_id, published_at desc);
index ads_looking on ads using gin (looking_for);
index ads_district on ads (community_id, district_id);
```

### 4.10 How the tables connect

```
auth.users 1─* members (one per community joined) *─1 communities
communities 1─* community_options (status, district)
communities 1─* profile_fields 1─* profile_field_options
members 1─* profile_values, profile_value_options, profile_links, photos, albums, ads, notes(author)
members 1─* applications ─0..1 chats(group)          (null chat = community application)
members 1─* admin_records (scope = community or group)
communities 1─* chats 1─* chat_members *─1 members
chats 1─* messages 1─* reactions ; messages 1─* messages (comments)
chats(group) 1─3 group_info_posts ; chats(group) 1─* events
albums 1─* album_photos *─1 photos
```

Deleting a member or a community removes everything below it (cascades). That is the GDPR "delete my account" path. Storage files are removed right after (§7).

---

## 5. Security (RLS) in plain English

| Data | Who can read | Who can write |
|---|---|---|
| Community row | Anyone (start page) | Platform admin |
| Status / District / fields / options | Members of that community | Community admin |
| A member's profile | Approved members, **except** people they blocked. Hidden from search if `visible_in_search = false`. Applicants see only themselves. | The member (`save_profile`); admins for `state`, `role`, `can_create_groups` |
| Applications | The applicant (own), and the admin of the target (community admin or group admin) | Applicant creates; admin decides |
| Admin records (real names, states, notes) | Admins of that scope only | Admins of that scope |
| Chats, messages, reactions | Chat members, and only messages after `visible_from_seq` | Members, if the group allows posting/commenting/reacting; never in a DM with a block |
| Group settings, info posts | Members of the community (headline/info for discovery), full settings to the group admin | Group admin, community admin |
| Calendar events | Group members (if calendar on) | Group admin |
| Notes and stars | **Only the author** (no admin override) | Only the author |
| Albums | Owner. Others see the name; photos only through `openAlbum` after the password | Owner |
| Photos | Profile bucket: public but unguessable URLs. Private bucket: signed URLs only, issued to people allowed to see the row that uses the photo | Owner |
| Ads | Approved members (minus blocks) | Author |

Extra protections:

- **Cross-community:** every policy checks `community_id` via `is_member()`.
- **Album passwords:** `password_hash` is revoked from client roles. Only the server checks it and then signs URLs.
- **Columns clients may not change** (role, state, score, username after sign-up) are protected with column grants and a trigger. Profile edits go through `save_profile`.
- **"Real" photos:** the "Real" label is the app's claim that the in-app camera took the photo. We never claim it can't be faked.
- **Re-encoding** every photo on the phone strips EXIF location data.
- **Service-role key:** only in `src/lib/supabase/admin.ts` (server-only), used for the username→email login lookup, album URL signing and system DMs.

---

## 6. Features, one by one

Each feature lists: what the user sees, which tables it uses, and where the work runs (**B** = browser to the database under RLS, **S** = Server Action, **R** = read in a Server Component).

### 6.1 Sign up, verify email, log in

- **Join (AC):** username, password ×2, email. **B** `supabase.auth.signUp`, after `username_available(community, username)`. A trigger on `auth.users` (or on first login for an existing email) creates the `members` row with `state = 'profile'`.
- **Same email, second community (D17):** if the email already has a login, the join form asks for that password, then creates the new `members` row. Separate profile; same password (Q8).
- **Verify email:** Supabase Auth sends the link. `/auth/confirm` verifies it and sends the user to the community login.
- **Log in (AB):** username **or** email + password. **S** `signInAction`: the server looks up the email for a username (service role, never exposed to the browser), then signs in. It always returns the same generic error. `last_login_at` is set after the response.
- **Forgot password:** Supabase reset email.

### 6.2 Community application and approval (Peter's process)

1. **Applicant (state `profile`):** edits own profile only (A25 "Create/edit profile").
2. **Application form (A25):** community `application_text` at the top, application image (camera = Real, or upload), message, real name 1/2. Which ones are required comes from `communities.require_app_*`.
3. **Apply:** **B** insert into `applications` (`chat_id = null`) and set `members.state = 'applied'`. The Apply button is dimmed while an application is open (unique index).
4. **"Chat with admin":** shown only if a DM with the admin already exists, i.e. the admin wrote first. Applicants can't open new DMs (`open_dm` refuses).
5. **Admin queue (A19 → A20):** list of `applications where chat_id is null and status in ('pending','later')`.
6. **Admin view (A21):** profile + linked profiles + application image (Real + date) + message + real names + 3 profile states + notes (from `admin_records`, community scope).
7. **Decide:** **S** `decideApplication(id, 'approved' | 'later' | 'rejected')`. Q5 default: show Approve only; the others stay available in the database.
8. **On approve:** `members.state = 'approved'`, the application's real names are copied into `admin_records` (community scope), the "Approve" button disappears, and an **approval email** is sent (§9). The member now has full access.

### 6.3 Group application and approval

1. **Find a group (A2 "Find new user/group"):** tap a group. If `direct_join`, join at once. Otherwise show the application form (A24) with the group's `application_text` and its `require_app_*` fields.
2. **Apply:** insert into `applications` with the group's `chat_id`.
3. **Group admin queue (A23)** → admin view **(A22)** with group-scope `admin_records`.
4. **On approve:** **S** add a `chat_members` row (with `visible_from_seq` from the history setting) and copy the real names into the group's `admin_records`. Then the **No-reply account** sends a DM: "You are now a member of {group}".

### 6.4 Profile builder (community admin)

- Create, order, edit and retire fields: type, label, choices, required, searchable, on card, per person, for which Statuses.
- Edit the Status and District lists (`community_options`), including `people = 2` for couples.
- **Rule:** a field with answers is never deleted, only made inactive, so old answers stay valid.
- Field definitions are cached (`'use cache'` + tag per community) and refreshed on save. They are read on almost every screen and change rarely.

### 6.5 Profiles

- **View (A3/B1):** one RPC `profile(community, user)` returns the built-ins, the answers, and the field definitions that apply to that Status. One trip.
- **Status at the top:** changing it shows or hides fields (D4). Couples (`people = 2`) see per-person fields twice, and a second birth date.
- **Username:** shown, not editable (D19).
- **Edit:** **B** `save_profile(community, base, values)` checks each answer against its field type and choices, writes everything in one transaction, then recomputes `score`.
- **Photos:**
  - the icon next to Back: tap to take a photo (Real) or upload;
  - 3 main photos;
  - each shows Real + date when it is Real.
- **Profile visible in search Y/N:** a toggle on your own profile.
- **Linked profiles (A32):** add up to 3 (search, +, 🗑). Linked profiles are shown first. The other person accepts by default (Q7).
- **Latest login, Profile score:** shown. Reputation is not shown for now.
- **Bottom bar:** DM (others only), Albums · + (admins: "Add to groups") · Ads. The ⭐ in the header opens your private notes about this person.

### 6.6 Profiles list, filter and swipe

- **List (A5):** title "Profiles", a swipe icon, a filter icon. Compact cards:
  - Username · Age · Status
  - District + Place, with the main photo thumbnail + Real
  - Profile score · My stars
  - Looking for
- **Filter (G1), applied on "Show profiles":**
  - Text in a field
  - Status (multi)
  - Looking for (multi)
  - Age from–to
  - District (multi)
  - Place (text)
  - Profile score min
  - My stars min–max
  - plus every field the admin marked searchable

  Reputation min is later.
- **One RPC, `search_profiles(community, filter, after, limit 30)`:**
  - **always:** approved members only, `visible_in_search`, and no blocks in either direction;
  - **built-ins:** indexed columns on `members`;
  - **age:** turned into a birth-date range, so the index works. A couple matches if either person is in range;
  - **builder fields:** one `exists` per active filter on `profile_values` / `profile_value_options`;
  - **my stars:** a join to the viewer's own `notes`;
  - **paging:** keyset `(score desc, user_id)`.
- **The filter is saved on the account** (`members.search_filter`), so it's remembered between visits and devices.
- **Swipe (A27):** the same RPC and filter. The client walks through the result pages. Tapping a star saves the rating and moves to the next profile.

### 6.7 Chat list (A1)

- **One RPC, `chat_list(community, limit 50)`:** unread first, then newest.
  - Unread = `last_seq − greatest(last_read_seq, visible_from_seq)`, with no `COUNT`.
  - For admins it also returns the number of open applications, for the badge on the admin icon (A19).
- **Search your chats:** filters the loaded list in the browser.
- **Updates:** the list refreshes when the app comes back to the screen (focus, visible, back). There is no per-user live channel; see §8.

### 6.8 Chat thread (A4)

- **Load:** `list_messages(chat, before_seq, limit 30)` returns the newest 30, with author name **and Status** ("Kitty553 (woman)"), date + time, image thumbnail + Real, reply snippet, reaction counts and my reaction. Older messages load on scroll up (keyset).
- **Send:** **B** `send_message`:
  1. checks membership, blocks and the group's `allow_posting`;
  2. takes the next `seq` by updating `chats.last_seq` (a row lock keeps numbers in order per chat);
  3. inserts the message;
  4. broadcasts it.

  All in one transaction. The message shows on screen immediately (optimistic).
- **Comment:** `send_message` with `reply_to_seq`. The snippet is copied at send. Needs `allow_commenting`.
- **React:** **B** `set_reaction(chat, seq, emoji | null)` upserts the one row per person, the trigger updates the counts, and the change is broadcast. Needs `allow_reactions`.
- **Edit:** own posts, if `allow_post_editing`. Group admins can't edit others' posts.
- **Delete:** own posts. Group and community admins can delete any. Deleting a post also deletes its comments.
- **Details (who reacted):** select on `reactions` for that post, limit 100.
- **Mark read:** **B** `mark_read(chat, seq)` when the chat opens and when you leave, never per message.
- **Images:** shrunk on the phone, uploaded to the private bucket, thumbnail in the chat, full image signed on tap (§7).

### 6.9 DMs, leaving and blocking

- **Open DM:** `open_dm(community, user)` finds or creates the DM. It's refused if either person blocked the other, or if you're still an applicant (unless the admin wrote first).
- **Leave a DM (D12):**
  - **"Keep chat, block writing":** adds a `blocks` row. The chat stays for both, and nobody can write.
  - **"Delete chat, block user":** deletes the DM (messages cascade, gone for both) and adds the `blocks` row.
- **A block also hides your profile** from that person: search, profile view, member lists, ads (D13).
- **Admin in a DM:** "Add to groups" for the other person (§6.11).

### 6.10 Groups

- **Create:** community admin, or members with `can_create_groups`. **S** `save_group` creates the chat, the 3 info posts and the creator as group admin in one transaction.
- **Edit group (A10), "Save":**
  - Name, Headline, Application text
  - Info 1–3
  - all settings in §4.7, including Calendar, Group visible in search and what's required to apply
  - the 3 profile-state labels
  - big buttons: Group statistics (A28), Member list (A30), Applications (A23)
- **Group info (G3):** headline, info posts, member list and **number of members** if `member_list` (or you're an admin), Leave group, Edit group (admin).
- **Info bar in the chat:** calendar icon + Info 1 headline.
- **Leave group:** delete your `chat_members` row.

### 6.11 Member lists, door list and "Add to groups" (A30/A31, F1)

- **One list screen, four uses:** group members, community members, group applications, community applications. It also works as a **door list** at events.
- **Row:** username, Status, real names 1/2, and the 3 profile-state numbers + notes, **editable in the row** (upsert `admin_records`). Delete from group. **+** searches members to add.
- **Sort:** by profile name for now.
- **Add to groups (F1), by role:**
  - **community admin:** "Community member" (approve or remove), "Group create/admin rights" (`can_create_groups`), and tick any group;
  - **group admin:** tick only their own groups.
- **Group admin assignment:** the community admin sets `chat_members.role = 'admin'` (one per group, D10).

### 6.12 Statistics (A28 group, A33 community)

- **One RPC:** `scope_stats(scope)` returns member count, count per Status (e.g. Man 32, Woman 46, Couple MF 65) and the sums of `state_1..3` from `admin_records`, with labels. One aggregate query over indexed rows. Admins only.

### 6.13 Calendar

- **Month view:** `events where chat_id = $1 and on_date between $start and $end`, plus the dates that have events. One query per month.
- **Group admin:** add, edit ✏️, delete 🗑 (with a confirm).
- **Everyone:** "DM Admin" on each event opens a DM with `created_by`.

### 6.14 Albums

- **List:** your albums (name, cover thumbnail, or a folder icon if locked).
- **Inside (owner):** **+** menu with Camera (Real) / Upload image / Delete album, and 🗑 on each photo.
- **Password:**
  - **S** `setAlbumPassword` stores a bcrypt hash;
  - **S** `openAlbum(album, password)` checks it on the server and returns signed URLs valid for 1 hour;
  - a wrong password never returns photos.

### 6.15 Ads

- **Ads tab (A6):** `search_ads(community, filter, after, limit 30)`. Cards show the ad picture thumbnail + Real, the headline (2 lines), the author's name, age, status, district and place, and the date.
- **Filter (D1), applied on "Show ads":**
  - Text
  - Status (multi)
  - Age
  - Looking for (multi)
  - District
  - Place
  - Profile score min
  - My stars min–max

  More "general" fields later. The same filter engine as profiles, applied to the ad's author plus the ad's own fields. Saved in `members.ad_filter`.
- **Publish / edit (D2):**
  - Looking for (multi), Headline, Text, District, Place
  - Image from Camera (Real), Upload, or **From profile/album** (copied)
  - Age, Status and Published are shown from the profile, not editable
  - Publish, Delete
- **View someone's ad (D3):** Profile, DM.

### 6.16 Find new user/group (A2)

- **`find_new(community, q, types, limit 30)`:**
  - empty until at least 2 characters are typed;
  - matches usernames and group names by substring (trigram indexes);
  - **only people and groups you're not connected to yet**;
  - respects `visible_in_search` and blocks;
  - filter: Users / Groups.
- **Tap:** a user opens their profile; a group joins directly or opens the application (A24).

---

## 7. Photos and files

**In plain English:** photos are shrunk on the phone before upload, stored privately except profile photos, and lists only ever load small thumbnails.

1. The phone resizes to about 1600 px plus a 256 px thumbnail, as WebP (JPEG 0.8 fallback for older Safari). Re-encoding strips location data. This is already built in `src/lib/image.ts`; it just needs to return a Blob instead of a data URL.
2. The phone uploads straight to Storage under `{community}/{owner}/{uuid}.webp` and `_t.webp`. A path is never reused (replacing a photo = new path), so files can be cached forever.
3. A `photos` row records the paths, `is_real` and `taken_at`.

| Bucket | Visibility | Used for | Read |
|---|---|---|---|
| `profile` | public, `cache-control: immutable, 1 year` | Icon, 3 main photos | Unguessable URL (fast, cacheable) |
| `private` | private | Chat, albums, ads, applications | Batch `createSignedUrls` (one call per page), URLs reused until they expire |

- Both buckets limit file size and type (`image/webp`, `image/jpeg`) on the server. The size limit is one constant, `MAX_IMAGE_BYTES`, default 5 MB.
- **Deleting** a message, photo, album or account removes the database row first, then the files right after (`after()`). A failed file delete only leaves an unreachable file.

---

## 8. Real-time chat

**In plain English:** WebSockets through Supabase Realtime are fast enough now and for years. No third-party service is needed.

**How it works:**

- When a chat is open, the phone joins **one private channel** for it: `chat:{id}`.
- `send_message`, edits, deletes and reactions call `realtime.send()` **inside the same database transaction**. Everyone with the chat open gets the change instantly.
- **Permission is checked once, when the channel is joined** (RLS on `realtime.messages` using `is_chat_member`), not once per message.
- **No `postgres_changes`.** That mode re-checks permissions per listener on every change, in a single line of processing. Supabase's own measurements show it slowing to about 5–10 changes per second with many listeners.
- **No per-user channel for the chat list.** It would mean one push per member per message (460 pushes for one post in a 460-member group). The chat list refreshes when the app is opened or returned to instead. This can be revisited after measuring, with a cap.
- **Reconnect:** after a dropped connection the open chat reloads anything newer than its last `seq` (one call), so nothing is missed.

**Why no third party (researched):**

| | Supabase Realtime | Ably | Pusher |
|---|---|---|---|
| Measured speed | Broadcast at 32,000 users: median 6 ms, 95% under 28 ms (Supabase benchmark) | Median ~65 ms globally | 90–200 ms, one data centre |
| Capacity | Pro: 500 users online included; up to 10,000 with the spend cap off (+$10 per 1,000) | Standard: 10k online, from $29/month + usage | Higher prices at scale |
| EU data | Same Stockholm project as the database | EU residency controls only on Enterprise | — |
| Extra login / data copy | No | Yes | Yes |

Revisit only above about 10,000 people online at once, or with users spread across continents.

---

## 9. Emails

- **Sent by Supabase Auth:** verify email, password reset. Use custom SMTP with an **EU-based provider** for GDPR (e.g. Brevo; to choose). The default Supabase sender is rate-limited and not for production.
- **Sent by the app:** "You are approved", sent by the `decideApplication` Server Action through the same provider's API.
- **No marketing emails.** Push notifications are later.

---

## 10. Ready for later (no rebuild needed)

| Later feature | What is already in place |
|---|---|
| **Translations / language choice** | Screen text is in one dictionary (`src/lib/i18n/en.ts`); add `sv.ts`. Admin-typed labels are `jsonb {"en": …}`, so add `"sv"`. `members.locale` picks the language. |
| **Km distance** | Add a coordinates column + PostGIS index. District/Place keep working. |
| **Reputation** | Add `members.reputation` + a ratings table. "Reputation min" plugs into the same filter engine. |
| **Co-admins** | Drop the `chat_one_admin` unique index. Roles already sit on `chat_members`. |
| **User levels 1–3** | Add `members.level`. Policies already go through helper functions, so there's one place to change. |
| **More communities** | A new row in `communities` + its options and fields. No code change. |
| **Payments** | New tables only. Nothing existing changes. |
| **Push notifications** | A `push_subscriptions` table + the service worker. No schema change elsewhere. |

---

## 11. Performance plan

**Targets (mid-range phone, 4G):**

| Metric | Target | Today |
|---|---|---|
| First load (cold) | under 2.5 s | — |
| First load (repeat) | under 1 s | — |
| Tap response (INP) | under 200 ms | — |
| Chat list JavaScript | ≤ 150 KB gzipped | 141 KB |
| Hot query p95 | under 100 ms | — |
| Chat list query | under 20 ms | — |
| Chat page query | under 15 ms | — |
| Profile search (5k members) | under 50 ms | — |

**Rules every slice follows:**

- One database trip per screen (one RPC, or `Promise.all`). Never `await` in a loop.
- Every list: `community_id` + only the needed columns + `limit` + keyset paging + an index, **in the same migration as the query**.
- Unread is a subtraction, never a count. Mark-read happens on open and on leave only.
- Send, react and mark-read go browser → database. No extra server hop.
- `'use cache'` only for data that rarely changes: the community row, field definitions, options, group info. Never for messages, unread counts, roles, blocks, notes or album access.
- Photos: thumbnails in lists, full size on tap.
- Admin, calendar, camera, albums, ads and the emoji picker load only when opened (`import()`), so the chat list stays small.
- **Verify before calling a slice done:** `EXPLAIN ANALYZE` the hot query on seeded data (5k members, 100k messages) against the targets above.

---

## 12. Build order

Each slice ships: migration + indexes + RLS, database tests (pgTAP via `supabase test db`), replacing the mock/localStorage code, typecheck, a phone-size check, and `EXPLAIN ANALYZE` of its hot query.

| # | Slice | Delivers |
|---|---|---|
| 0 | Foundation | Supabase project (Stockholm), migrations folder, helper functions, generated types, `lib/supabase/admin.ts`, `lib/limits.ts`, test harness |
| 1 | Accounts | Sign-up, email verify, login (username or email), logout, `members`, platform/community admin, No-reply account, remove `mocks/session.ts` |
| 2 | Profile builder + options | `community_options`, `profile_fields`, options, admin screens to manage them, seed Biking Stockholm |
| 3 | Profiles | `profile` + `save_profile`, Status-driven fields, couples, photos (profile bucket), score, visibility, linked profiles |
| 4 | Community approval | Applications, A25 form, A19/A20/A21, `admin_records`, approval email |
| 5 | Chats core | Chats, members, messages, chat list, thread paging, send, mark-read, Realtime |
| 6 | DMs + blocking | `open_dm`, leave options, blocks everywhere, admin "Add to groups" from a DM |
| 7 | Groups | Create/edit with all settings, info posts, group info, group applications (A22/A23/A24), No-reply DM |
| 8 | Post actions + images | Reactions (one per person), comments, edit/delete rules, chat images, Real flag |
| 9 | Search | `search_profiles`, filter, swipe (A27), `find_new` |
| 10 | Notes + stars | `notes`, DM ⭐ and profile ⭐ share one record, stars filter |
| 11 | Member lists + statistics | A30/A31 editable rows, door list, A28/A33 |
| 12 | Calendar | Events, edit/delete, DM Admin |
| 13 | Albums | Albums, password, signed URLs, "From profile/album" copy |
| 14 | Ads | Ads, `search_ads`, filter |
| 15 | Launch checks | Cookie notice + privacy page, account delete, load test, Auth rate limits, SMTP live |

The app stays usable after every slice.

---

## 13. Open questions (built with a default, easy to change)

| # | Question for Peter | Default we build | Changing it later |
|---|---|---|---|
| Q1 | District list? | Sweden's 21 regions (län) as seed data | Edit the rows |
| Q2 | Profile score rule? | The rule in §4.5 | Change one function |
| Q3 | Couples: two answers per field? | Yes, per field (`per_person`); two birth dates | Untick per field |
| Q4 | "Visible in search: No" also hides from "Find new user"? | Yes, hidden everywhere in search | One rule in `find_new` |
| Q5 | Approve only, or Approve / Later / No? | UI shows Approve; database supports all | Show more buttons |
| Q6 | Who sees real names? | Admins only | One policy |
| Q7 | Linked profile must accept? | Yes (pending → accepted) | Start rows as accepted |
| Q8 | Same email in two communities = same password? | Yes | — (Supabase allows one password per email) |

Also to pick before launch (technical, not for Peter): the EU email provider, and `MAX_IMAGE_BYTES` (default 5 MB).

---

## 14. Project rules (updated 2026-10-06)

These rule files were updated to match Peter's decisions:

- `AGENTS.md` / `docs/AGENTS.md`:
  - "Do not build: … reputation, profile score" → profile score is now V1 (rule TBD); reputation stays Later.
  - The "Undecided" list → account scope, Ads tab, 2 vs 3 tabs and path vs subdomain are now decided (D15, D17, path).
- `.cursor/rules/00-application-context.mdc`: the same two changes.
- `.cursor/rules/performance.mdc`: the per-user Realtime channel for the chat list → refresh on focus instead (§8).
- `.cursor/rules/ui-context.mdc`: "Verified" → "Real".
