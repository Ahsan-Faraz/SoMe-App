# SoMe — Backend and Database Implementation Plan

Status: analysis, before implementation. Date: 2026-09-29.
Sources cross-checked: spec v0.33 (via `docs/User-Stories-and-Requirements.tex`), meeting transcript notes captured in that doc, mockup `SoMe App 260922`, `.cursor/rules/*` (architecture, performance, scaling, project-structure, progress-tracker), and the built frontend in `src/`.

Where sources disagree, this document names the conflict and gives the **safest reversible assumption**. It does not pick a product winner.

---

## 0. Summary

- **Stack:** Supabase (Postgres, Auth, Storage, Realtime) in `eu-north-1`, and Next.js 16 on Vercel functions in `arn1`. There is no other service. No Redis, no queue, no workers, no GraphQL, no global client store. Nothing measured calls for them.
- **Transport:**
  - Server Components read through the DAL (`lib/auth/dal.ts`, `cache()` + `getClaims()`).
  - Hot writes (send, react, mark-read) go from the browser to a Postgres RPC under RLS, with no Next hop.
  - Privileged work (admit, group membership, album password, login by username) runs as Server Actions.
- **Size:** 15 tables and 3 storage buckets. Every table maps to a V1 story. The analysis also dropped two tables that looked necessary:
  - **Verification** is a camera photo sent into the admin DM, so it needs no table of its own.
  - **Album unlock** is enforced by returning short-lived signed URLs only after the password check, so it needs no table either.
- **Biggest design correction:** `performance.mdc` plans a per-user Realtime channel for A1 unread bumps. That means one Broadcast per member per message: 460 writes to `realtime.messages` for every post in a 460-member group. This is the same O(members) fan-out the unread design was built to avoid. **Recommendation:** in V1, A1 refetches its single RPC on focus and navigation, and only the open chat subscribes. See §5.4.
- **Blocking TBDs for later slices:** account scope (affects auth), ads model (AD-001), and direct join. Slices 1–10 can proceed on the safe assumptions below. Ads (slice 11) waits for AD-001.

---

## 1. Feature / functionality inventory

V1 = must ship. Later = never build now. TBD = product decision needed.

| Area | Feature | Stories | V1? | Backend needed |
|---|---|---|---|---|
| Auth | Join (username, password×2, email) → email link → pending | AUTH-001/002 | V1 | Auth signUp, member row, confirm route |
| Auth | Login with username + password | AUTH-003 | V1 | Server-side username→email lookup + signIn |
| Auth | Pending user: edit profile, DM admin only | AUTH-004 | V1 | RLS gate on `members.state` |
| Auth | Logout | AUTH-005 | V1 | `signOut` |
| Auth | Forgot password | AUTH-006 | TBD (flow) | Supabase reset, UI missing |
| Auth | Google login | — | Later | — |
| Community | Start AA / About AB | COMM-001/002 | V1 | `communities` read, cacheable |
| Community | Account scope per-community vs platform | COMM-006 | **TBD** | Shapes auth; see §9 |
| Community | Path vs subdomain | — | **TBD** | None (routing only) |
| Admin | Admit (F1 "Community" checkbox) | ADMIN-001 | V1 | Privileged RPC |
| Admin | Assign to groups (F1), add (F2), remove (A11) | ADMIN-002, GROUP-005 | V1 | Privileged RPC |
| Admin | Create / edit / rename / delete group (A10) | GROUP-001..004 | V1 | Chats + settings + info posts |
| Admin | Custom member status per group (1 text + 3 checkboxes) | GROUP-007 | V1 | Columns on `chat_members`; **UI missing** |
| Admin | Co-admins | — | Later | — |
| Profile | Base fields: username, icon, photos, status, location, about ≤ 32k, headline | PROF-001..006 | V1 | `members` columns + avatar bucket |
| Profile | 1 vs 3 main photos | PROF-003 | **TBD** | Schema supports both |
| Profile | Latest login shown | PROF-007 | V1 | `members.last_login_at` |
| Profile | Dynamic fields (defs + values) per community | DYN-001..005 | V1 | `profile_field_defs`, `profile_field_values` |
| Profile | First-community field list | DYN | **TBD** | Seed data only |
| Profile | Profile score, reputation | — | Later | — |
| Search | A5 member list + G1 filter, filter remembered on account | SEARCH-001..004 | V1 | One RPC + `members.search_filter` |
| Search | Cross-community search | — | Later | — |
| Chat | A1 list, unread, unread-first sort, local search | DM-001/002 | V1 | `chat_list` RPC |
| Chat | A2 directory (users + groups) | DM-003 | V1 | `directory` RPC |
| Chat | Open/create DM | DM-004 | V1 | `open_dm` RPC |
| Chat | G2 leave; leave+delete (bilateral); leave+block | DM-005..007 | V1 | RPCs + `blocks` |
| Chat | Who can contact me | — | **TBD** | Not built |
| Posts | Send text, image, camera image | POST-001..003 | V1 | `send_message` RPC + chat bucket |
| Posts | Keyset history paging (long groups) | POST-004, NFR | V1 | `(chat_id, seq)` PK |
| Posts | React + who reacted | POST-005 | V1 | `reactions` |
| Posts | Comment on a post with snippet | POST-006 | V1 | `messages.reply_to_seq` |
| Posts | Edit own (group flag); delete own; admin deletes any | POST-007/008 | V1 | RPCs |
| Posts | Edit in DMs | — | **TBD** | Off until decided |
| Verify | In-app camera photo + date, sent to admin DM | VERIFY-001..005 | V1 | `messages.camera`, `captured_at` |
| Group | G3 info, member list gated by setting | GROUP-006 | V1 | `group_info` RPC |
| Group | Sticky info posts 1–3 (B2) | STICKY-001..003 | V1 | `group_info_posts` |
| Group | Calendar A4/A12, admin CRUD | CAL-001..004 | V1 | `events` |
| Group | Direct join | GROUP | **TBD** | Flag stored, join path disabled |
| Group | Max group size | — | **TBD** | Not enforced |
| Notes | Private notes (chat + profile), stars 1–5 on profile | NOTE-001..004 | V1 | `notes`, author-only |
| Albums | Albums with optional password, camera/upload | ALB | V1 | `albums`, `album_images`, bucket |
| Ads | Ads A6–D3 vs ads-as-posts | AD-001 | **TBD** | Build last |
| Notifications | Push | — | Later | — |
| Payments | Swish, payments | PAY | Later | — |
| Media | Video / audio | — | Later | — |
| GDPR | Export / erase mechanics | SEC | **TBD** | Cascades designed in |

---

## 2. Frontend → Backend mapping

The frontend currently reads mocks through `src/features/*/queries.ts` (server-only) and persists client state in localStorage. The backend replaces the **bodies** of those query functions and the localStorage modules. Component props stay the same unless noted.

### 2.1 Reads (replace mock bodies, keep signatures)

| Screen | Current source | Becomes | Round trips |
|---|---|---|---|
| AA / AB start, about | `communities/queries` mock | `select` on `communities` by slug, wrapped in `'use cache'` + `cacheTag('community:'+slug)` | 0 on hit, 1 on miss |
| Session / role | `mocks/session` cookie, `getViewer()` | DAL `getMember(slug)` = `getClaims()` + one indexed `members` row, `cache()` | 1 |
| A1 chat list | `chats/queries.listChats` | `rpc('chat_list', {community, limit:50})` | 1 |
| A2 directory | `listDirectory` | `rpc('directory', {community, q, limit:30})` (debounced 200 ms) | 1 per query |
| B1 / B3 thread | `getThread` | `rpc('list_messages', {chat, before_seq:null, limit:30})` + one `createSignedUrls` batch for images | 2 (`Promise.all` not possible: signing needs paths) |
| B1 scroll back | none (loads all) | same RPC with `before_seq` = oldest seq | 1 per page |
| G3 group info | `getGroupInfo` | `rpc('group_info', {chat})`; members only when `member_list` or admin | 1 |
| B2 info post | `getInfoPost` | `select` on `group_info_posts` (chat_id, n) | 1 |
| A10 group form | `getGroup` + `listInfoFields` | `Promise.all` of two PK selects | 1 |
| A11 / F2 members | `listGroupMembers`, `listPeopleToAdd` | `rpc('group_members')`, `rpc('addable_members', {q, limit})` | 1 |
| F1 assign | `listAssignments` | `rpc('member_assignments', {community, user})` | 1 |
| A5 profiles | `profiles/queries` | `rpc('search_profiles', {community, filter, after, limit:30})` | 1 |
| A3 profile | `getProfile` | `rpc('profile', {community, user})`: base + values + defs | 1 |
| A4 / A12 calendar | `calendar/storage` (localStorage) | `select` `events` where chat_id and date range, `limit 200` | 1 |
| B5 notes | `PrivateNotes` (localStorage) | `select` on `notes` PK | 1 |
| Albums list / view | `albums/storage` (localStorage) | `select` albums by owner; images only via Server Action after password | 1 / 1 |
| A6 ads, D1–D3 | `ads/storage` (localStorage) | `rpc('search_ads')`, `select` by id | 1 |

### 2.2 Writes

| UI action | Component | Transport | Backend |
|---|---|---|---|
| Join | `JoinForm` → `auth/browser.signUp` | Browser `supabase.auth.signUp` after `username_available` RPC | Trigger creates `members` row (pending) |
| Login | `LoginForm` → `signIn` | **Server Action** (username→email needs service role) | `signInWithPassword`, `last_login_at` in `after()` |
| Logout | `LogoutButton` | Browser `auth.signOut()` | — |
| Send post | `ChatThread.send` | Browser `rpc('send_message')`, optimistic | seq, insert, chat bump, Broadcast in one transaction |
| Image / camera | `PictureSheet`, `CameraCapture` | Browser Storage upload (full + thumb) then `send_message` with paths | Bucket RLS by chat membership |
| React | `PostSheet` | Browser `rpc('toggle_reaction')`, optimistic | PK upsert/delete + Broadcast |
| Who reacted / Details | `PostSheet` (stubs today) | Browser select on `reactions` for (chat, seq) limit 100 | — |
| Edit / delete post | `PostSheet` (stubs today) | Browser `rpc('edit_message')` / `rpc('delete_message')` | Flag and role checks in RPC |
| Comment | `PostSheet` | `send_message` with `reply_to_seq` | FK cascade on parent delete |
| Mark read | open / leave thread | Browser `rpc('mark_read', {chat, seq})` on open and on `pagehide`/unmount | One row update |
| Leave / delete / block | `LeaveChat` (localStorage `some:chats:`) | Browser RPCs `leave_chat`, `delete_dm`, `block_user` | See §4 |
| Open DM | Directory / profile "Chat" | Browser `rpc('open_dm', {community, user})` → chat id | Find-or-create |
| Create / edit / delete group | `GroupForm` (no-op submit today) | Server Action → `rpc('save_group')` / `rpc('delete_group')` | One transaction |
| Admit / assign groups | `AssignGroups` (localStorage `some:assign:`) | Server Action → `rpc('admit_member')`, `rpc('set_group_member')` | Admin check in RPC |
| Add / remove group member | `AddList`, `MemberList` (local state) | Server Action → `set_group_member` | same |
| Profile edit | `ProfileFields` (hardcoded demo fields), `ReplacePhoto` (localStorage `some:photo:`) | Browser `rpc('save_profile', {base, values})`; avatar to public bucket | Values replaced per def in one transaction |
| Filter save | `ProfileFilter` (localStorage `some:filter:`) | Browser update of `members.search_filter` (debounced 500 ms) | One column |
| Calendar CRUD | `EventForm`, `CalendarBoard` (localStorage) | Browser insert/update/delete on `events` under RLS (group admin) | — |
| Notes / stars | `PrivateNotes` (localStorage `some:notes:`) | Browser upsert on `notes` under RLS (author only) | — |
| Album create / upload / password | `AlbumView`, `AlbumList` (localStorage + sessionStorage) | Browser insert/upload for owner; **Server Action** for set password and unlock | bcrypt via pgcrypto |
| Ads CRUD / filter | `AdEditor`, `AdFilterForm` | Browser under RLS; filter in `members.ad_filter` | Blocked on AD-001 |

### 2.3 Frontend contract changes the backend forces (small, listed so nothing silently breaks)

1. **Viewer id.** `getViewer()` returns `u-me`. It must return the real `auth.uid()` and member state. `roleForUsername` and `mocks/session.ts` get deleted.
2. **`ChatMessage`.**
   - `reactions: string | null` → `{emoji: string, count: number, mine: boolean}[]`.
   - `comment: string | null` → `replyTo: {seq, author, snippet} | null`.
   - `image` / `imageSrc` → `thumbUrl`, `fullPath` (full URL signed on tap).
   - `timeLabel` is formatted on the server from `created_at`.
   - Add `seq` (the paging cursor).
3. **Group G2.** The current UI offers "leave and block" for groups too. The spec (DM-005..007) makes delete and block **DM-only**, so groups should show only "Leave". This is a frontend fix and needs no backend support for group block.
4. **`ProfileFields`.** It hardcodes demo fields (bike, Gravel, days). It must render from `profile_field_defs` through the planned FieldRenderer.
5. **`imageDataUrl` (`lib/image.ts`).** It encodes a JPEG data URL, and callers store that data URL in localStorage. Two changes:
   - Output must be a `Blob`: WebP, with a JPEG q 0.8 fallback when `blob.type !== 'image/webp'`, at ~1600 px plus a 256 px thumbnail, per `performance.mdc`.
   - Data URLs in localStorage hit the ~5 MB quota after a few photos, so they must go.
6. **Missing UI that V1 stories need.** Backend columns are added now so no later migration is needed:
   - The custom member status editor (GROUP-007).
   - A "show sticky posts" toggle on A10 (STICKY-003).
   - A forgot-password page (AUTH-006, flow TBD).

---

## 3. Database design

### 3.1 Conventions

- UUID primary keys (`gen_random_uuid()`), except `messages`: PK `(chat_id, seq)`.
- Every tenant table has `community_id uuid not null`, including child tables. RLS can then filter on an indexed local column without joining up the tree.
- `timestamptz` everywhere; `created_at default now()`.
- Length limits live in `check` constraints. The DB is the final validator, so a direct browser call cannot bypass them.
- Enums use `text` + `check (x in (...))`, not Postgres enum types. A new value is then a one-line migration.
- RLS is on for every table. Policies use `(select auth.uid())`.
- Two `security definer` helpers mark the only places RLS is intentionally crossed. Both set `search_path = ''` and are `stable`:
  - `is_member(community)`
  - `is_chat_member(chat)`

### 3.2 Tables

```sql
-- Tenancy -------------------------------------------------------------
communities (
  id uuid pk, slug text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null, headline text not null, about text[] not null default '{}',
  hero_path text, about_path text,
  admin_user_id uuid not null references auth.users on delete restrict,
  created_at timestamptz
)

-- One row per (community, user): membership + community-scoped profile.
members (
  community_id uuid references communities on delete cascade,
  user_id uuid references auth.users on delete cascade,
  username text not null check (char_length(username) between 3 and 32),
  role text not null default 'member' check (role in ('member','admin')),
  state text not null default 'pending' check (state in ('pending','approved')),
  status text check (status in ('couple','man','woman','other')),   -- "Status" in spec
  country text, region text, place text check (char_length(place) <= 80),
  headline text check (char_length(headline) <= 120),
  about text check (char_length(about) <= 32000),                   -- PROF-005
  icon_path text, photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  search_filter jsonb, ad_filter jsonb,                              -- "remembered on this account"
  last_login_at timestamptz, created_at timestamptz,
  primary key (community_id, user_id)
)
unique index members_username_uq on members (community_id, lower(username));
index members_user_idx on members (user_id, community_id);          -- performance.mdc
index members_state_idx on members (community_id, state);           -- admin pending list

-- Dynamic profile fields ------------------------------------------------
profile_field_defs (
  id uuid pk, community_id uuid not null references communities on delete cascade,
  key text not null, label text not null,
  kind text not null check (kind in ('text','longtext','checkbox','number','select','multiselect','area')),
  options text[] not null default '{}', position smallint not null,
  searchable boolean not null default false, on_card boolean not null default false,
  for_status text[],                                                  -- null = all statuses
  unique (community_id, key)
)
profile_field_values (
  id bigint generated always as identity pk,
  community_id uuid not null, user_id uuid not null,
  field_def_id uuid not null references profile_field_defs on delete cascade,
  value_text text check (char_length(value_text) <= 4000),
  value_num numeric, value_bool boolean,
  foreign key (community_id, user_id) references members on delete cascade
)
unique index pfv_uq on profile_field_values (field_def_id, user_id, coalesce(value_text,''));
index pfv_num on profile_field_values (field_def_id, value_num);
index pfv_text on profile_field_values (field_def_id, value_text);
index pfv_user on profile_field_values (community_id, user_id);

-- Chats (DM and group are both chats; group ≠ community) -------------------
chats (
  id uuid pk, community_id uuid not null references communities on delete cascade,
  kind text not null check (kind in ('dm','group')),
  name text check (kind = 'dm' or char_length(name) between 1 and 80),
  headline text check (char_length(headline) <= 200),
  dm_user_a uuid, dm_user_b uuid,                                     -- a < b, dm only
  calendar boolean not null default true, history boolean not null default true,
  member_list boolean not null default true, edit_posts boolean not null default true,
  direct_join boolean not null default false, show_sticky boolean not null default true,
  last_seq bigint not null default 0,
  last_message_at timestamptz, last_message_preview text,
  created_by uuid not null, created_at timestamptz,
  check ((kind = 'dm') = (dm_user_a is not null and dm_user_b is not null and dm_user_a < dm_user_b))
)
unique index chats_dm_uq on chats (community_id, dm_user_a, dm_user_b) where kind = 'dm';
index chats_recent on chats (community_id, last_message_at desc);     -- performance.mdc

chat_members (
  chat_id uuid references chats on delete cascade,
  user_id uuid not null, community_id uuid not null,
  role text not null default 'member' check (role in ('member','admin')),
  last_read_seq bigint not null default 0,
  visible_from_seq bigint not null default 0,                         -- history=false ⇒ last_seq at join
  member_status_text text check (char_length(member_status_text) <= 60), -- GROUP-007
  member_flags boolean[3] not null default '{false,false,false}',
  joined_at timestamptz,
  primary key (chat_id, user_id),
  foreign key (community_id, user_id) references members on delete cascade
)
index chat_members_user on chat_members (user_id, community_id);

messages (
  chat_id uuid references chats on delete cascade,
  seq bigint not null,
  community_id uuid not null,
  author_id uuid not null references auth.users on delete cascade,
  body text check (char_length(body) <= 8000),                        -- limit TBD, one constant
  image_path text, thumb_path text,
  camera boolean not null default false, captured_at timestamptz,     -- VERIFY; claim, not proof
  reply_to_seq bigint,
  edited_at timestamptz, created_at timestamptz not null default now(),
  primary key (chat_id, seq),
  foreign key (chat_id, reply_to_seq) references messages (chat_id, seq) on delete cascade,
  check (body is not null or image_path is not null)
)

reactions (
  chat_id uuid, seq bigint, user_id uuid, community_id uuid not null,
  emoji text not null check (char_length(emoji) <= 16),
  created_at timestamptz,
  primary key (chat_id, seq, user_id, emoji),
  foreign key (chat_id, seq) references messages on delete cascade
)

blocks (
  community_id uuid, blocker_id uuid, blocked_id uuid, created_at timestamptz,
  primary key (community_id, blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
)
index blocks_blocked on blocks (community_id, blocked_id);

-- Group extras ----------------------------------------------------------
group_info_posts (
  chat_id uuid references chats on delete cascade, n smallint check (n between 1 and 3),
  community_id uuid not null,
  headline text not null check (char_length(headline) <= 120),
  body text not null check (char_length(body) <= 32000),
  primary key (chat_id, n)
)
events (
  id uuid pk, chat_id uuid not null references chats on delete cascade, community_id uuid not null,
  on_date date not null, headline text not null check (char_length(headline) <= 120),
  body text check (char_length(body) <= 4000), created_by uuid not null, created_at timestamptz
)
index events_chat_date on events (chat_id, on_date);

-- Private -----------------------------------------------------------------
notes (
  author_id uuid, community_id uuid not null,
  target_kind text check (target_kind in ('chat','user')), target_id uuid,
  body text not null default '' check (char_length(body) <= 32000),
  stars smallint check (stars between 1 and 5),
  updated_at timestamptz,
  primary key (author_id, target_kind, target_id)
)

albums (
  id uuid pk, community_id uuid not null, owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  password_hash text,                                                 -- crypt(pw, gen_salt('bf', 10)); never selected by clients
  created_at timestamptz,
  foreign key (community_id, owner_id) references members on delete cascade
)
index albums_owner on albums (community_id, owner_id);
album_images (
  id uuid pk, album_id uuid not null references albums on delete cascade, community_id uuid not null,
  path text not null, thumb_path text not null,
  camera boolean not null default false, captured_at timestamptz, created_at timestamptz
)
index album_images_album on album_images (album_id, created_at desc);

-- Ads (slice 11, blocked on AD-001) ----------------------------------------
ads (
  id uuid pk, community_id uuid not null, user_id uuid not null,
  looking_for text, headline text not null check (char_length(headline) <= 120),
  body text check (char_length(body) <= 4000), region text, place text,
  image_path text, camera boolean not null default false,
  published_at timestamptz not null default now(), updated_at timestamptz,
  foreign key (community_id, user_id) references members on delete cascade
)
index ads_recent on ads (community_id, published_at desc);
```

**Not stored on the ad:** age and status. They are read from the author's profile at query time, so the UI's "from profile, not editable" rule holds and the data cannot drift.

### 3.3 Relationships

```
communities 1─* members *─1 auth.users
communities 1─* profile_field_defs 1─* profile_field_values *─1 members
communities 1─* chats 1─* chat_members *─1 members
chats 1─* messages 1─* reactions ; messages 1─* messages (reply_to_seq)
chats(group) 1─3 group_info_posts ; chats(group) 1─* events
members 1─* albums 1─* album_images ; members 1─* ads ; members 1─* notes(author)
```

Deleting a user or a community cascades everything. That is the GDPR erase path. Storage objects are deleted by a follow-up in `after()` (§4.6).

### 3.4 Query patterns (each is one statement or one RPC)

| Pattern | SQL shape | Index used |
|---|---|---|
| A1 | `chat_members cm join chats c on c.id = cm.chat_id where cm.user_id = me and cm.community_id = $c order by (c.last_seq > cm.last_read_seq) desc, c.last_message_at desc nulls last limit 50`; DM name via one join to `members` on the other user | `chat_members_user`, chats PK |
| Unread | `greatest(c.last_seq - greatest(cm.last_read_seq, cm.visible_from_seq), 0)` in the A1 select | none extra, no `COUNT` |
| Thread page | `where chat_id = $1 and seq > visible_from and ($cursor is null or seq < $cursor) order by seq desc limit 30`; reactions aggregated for those 30 via `(chat_id, seq)` PK prefix; reply snippet via PK lookup | messages PK |
| Search A5 | `members where community_id = $c and state = 'approved'` + one `exists (select 1 from profile_field_values where field_def_id = $f and value_num between …)` per active filter; keyset `lower(username) > $after order by lower(username) limit 30` | `members_username_uq`, `pfv_num` / `pfv_text` |
| Directory | `members` + group `chats` with `lower(name) like '%'||q||'%'`, `limit 30` | Seq scan inside one community is fine at V1 sizes; add `pg_trgm` GIN only if `EXPLAIN ANALYZE` shows > 50 ms |
| Calendar month | `events where chat_id = $1 and on_date between $a and $b order by on_date limit 200` | `events_chat_date` |

No `select('*')`, no `count: 'exact'`, no OFFSET on any list.

### 3.5 Transactions (inside single Postgres functions, so no client-side multi-step writes)

- **`send_message`:**
  1. Check membership, block, and state.
  2. `update chats set last_seq = last_seq + 1, last_message_at = now(), last_message_preview = left(body, 120) where id = $chat returning last_seq`. The row lock serializes seq per chat.
  3. Insert the message.
  4. `realtime.send(...)` to topic `chat:{id}`.

  The lock is per chat, so different chats never contend. A single group handles hundreds of sends per second before this lock matters.
- **`delete_message`:** delete, then recompute the preview from `max(seq)` if the deleted message was the last one.
- **`save_group`:** upsert the chat, upsert 3 info posts, and on create insert the creator as `chat_members.role = 'admin'`.
- **`set_group_member`:** insert with `visible_from_seq = case when history then 0 else last_seq end`, or delete.
- **`admit_member`:** set `state = 'approved'`.
- **`delete_dm`:** delete the chat row. Messages and reactions cascade, so the other side loses access too (DM-006).
- **`save_profile`:** update base columns, then for each submitted def delete its values and insert the new ones.
- **Join trigger** (`after insert on auth.users`): reads `raw_user_meta_data.community` and `username`, then inserts the pending `members` row and the DM with the community admin, so "Chat with admin" works immediately (AUTH-004).

---

## 4. API design

"API" here means the Postgres RPCs (called from the browser or from Server Components), the Server Actions, and one Route Handler. There is no REST layer. PostgREST is the REST layer.

### 4.1 Authentication and authorization

- **Authentication:** Supabase Auth session cookies, refreshed in `proxy.ts` only. The server verifies with `getClaims()` (local JWT verification against JWKS).
- **Authorization:** always in Postgres (RLS or a check inside the RPC). The UI hiding a button is never the gate. Roles:
  - `approved member`: full member features in the community.
  - `pending member`: own profile, plus the DM with the community admin only.
  - `community admin` = `members.role = 'admin'`: admit, groups, all group admin rights.
  - `group admin` = `chat_members.role = 'admin'`. In V1 this is only the creator, who is always the community admin.
  - `author`: own posts, own notes, own albums, own ads.

### 4.2 RPCs (browser or server, under RLS / in-function checks)

| RPC | Input | Output | Authz | Errors (SQLSTATE `P0001`, message = code) |
|---|---|---|---|---|
| `username_available` | community slug, username | boolean | anon | `invalid_username` |
| `chat_list` | community_id, limit ≤ 100 | `{id, kind, name, preview, last_message_at, unread}[]` | approved (pending: admin DM only) | — |
| `directory` | community_id, q, limit ≤ 50 | `{kind:'user'|'group', id, name, member}[]` | approved | — |
| `open_dm` | community_id, user_id | chat_id | approved, or pending with target = admin; not blocked by target | `blocked`, `not_member`, `self` |
| `list_messages` | chat_id, before_seq?, limit ≤ 50 | `{seq, author_id, author, body, thumb_path, image_path, camera, captured_at, reply_to, reactions[], edited, created_at}[]` | chat member; seq > visible_from | `not_member` |
| `send_message` | chat_id, body?, image_path?, thumb_path?, camera, captured_at?, reply_to_seq? | `{seq, created_at}` | chat member, approved (or admin DM) | `not_member`, `blocked`, `empty`, `bad_path` |
| `edit_message` | chat_id, seq, body | void | author, and group `edit_posts`; DMs off (TBD) | `edit_disabled`, `forbidden` |
| `delete_message` | chat_id, seq | void | author, or group admin | `forbidden` |
| `toggle_reaction` | chat_id, seq, emoji | `{on: boolean}` | chat member | `not_member` |
| `mark_read` | chat_id, seq | void | self row; `greatest()` so stale calls are no-ops | — |
| `leave_chat` | chat_id | void | self | — |
| `delete_dm` | chat_id | void | DM participant | `not_dm` |
| `block_user` | community_id, user_id | void | self; also leaves the DM | — |
| `group_info` | chat_id | `{name, headline, flags, info_headlines[], members[] | null, calendar}` | community member; members only if `member_list` or admin | `not_found` |
| `search_profiles` | community_id, filter jsonb, after?, limit ≤ 50 | `{user_id, username, icon_path, status, region, place, card_values}[]` | approved | `bad_filter` |
| `profile` | community_id, user_id | base + values + defs + `last_login_at` | approved (own: pending too) | `not_found` |
| `save_profile` | community_id, base jsonb, values jsonb | void | self | `too_long`, `bad_value` (type vs def) |

**Direct table access under RLS** (no RPC needed, where one statement suffices):

- `events` insert, update, delete (group admin); select (chat member, `calendar` on)
- `notes` upsert and select (author only)
- `members.search_filter` / `ad_filter` update (self; column grant only)
- `albums` insert (owner)
- `album_images` insert (owner)
- `ads` CRUD (author)

### 4.3 Server Actions (privileged or secret-bearing)

| Action | Why server | Steps |
|---|---|---|
| `signInAction(community, username, password)` | username→email mapping must not be exposed to anon (email enumeration) | Service-role lookup `members` → `auth.users.email`, then `signInWithPassword` on the cookie-bound server client, then `after()` sets `last_login_at`. Always returns the same `invalid_credentials` error. |
| `admitMember`, `setGroupMember`, `saveGroup`, `deleteGroup` | Admin work; `performance.mdc` routes it through the server | Call the matching RPC with the user's JWT. The RPC checks the role. Service role is not needed, so RLS still applies. |
| `setAlbumPassword(albumId, password \| null)` | Hashing must not be possible from the client with a chosen salt | `rpc` → `crypt(pw, gen_salt('bf', 10))`, owner only |
| `openAlbum(albumId, password?)` | Wrong password must never return bytes (ALB) | RPC `album_check(album, pw)` returns image paths only if owner, if there is no password, or if `crypt` matches. The server then calls **one** `createSignedUrls(paths, 3600)` with the service role. The client keeps the URLs in memory for the session. |

Return shape: `{ ok: true, data } | { ok: false, error: ErrorCode }`. `ErrorCode` is a string union mapped to `t.errors.*`. Actions never throw raw DB messages to the client.

### 4.4 Route Handler

- `GET /auth/confirm?token_hash&type&next`: calls `verifyOtp`, then redirects to `/{community}/login` (AUTH-002). This is the only route handler.

### 4.5 Validation

- Client: HTML constraints, for UX only.
- Server Actions: typed parsing of `FormData` (manual guards, no zod; it is not on the allowlist).
- Postgres: `check` constraints and RPC argument checks are the authority.
- `save_profile` validates each value against its def's `kind` and `options`.
- Lengths are shared through `lib/limits.ts` constants that match the SQL checks.

### 4.6 Storage

| Bucket | Visibility | Path | Read rule | Write rule |
|---|---|---|---|---|
| `avatars` | public, `cache-control: max-age=31536000, immutable` | `{community}/{user}/{uuid}.webp` | anyone holding the unguessable URL | owner folder only (RLS on `storage.objects`) |
| `chat` | private | `{chat_id}/{uuid}.webp` + `_t.webp` | `is_chat_member(folder[1])` → batch `createSignedUrls` | chat member |
| `albums` | private | `{album_id}/{uuid}.webp` | owner only via RLS; others only through `openAlbum` (service role) | album owner |

- Both private buckets set `file_size_limit` and `allowed_mime_types = {image/webp, image/jpeg}` on the bucket, so the server enforces them.
- The size limit is one constant, `MAX_IMAGE_BYTES`, whose value is TBD (SEC-008). Proposed default: 5 MB.
- **Avatars are public.** `performance.mdc` lists only chat, album, and verification images as private, and public avatars keep the HTTP cache working. The tradeoff: anyone with a leaked URL can see that photo. Flagged in §9.
- **Deleting a message, album, or ad** deletes the DB row first, then removes the storage objects in `after()`. If the removal fails, the only result is an orphaned, unreachable file. No queue is needed.

---

## 5. Performance strategy

### 5.1 Round trips per screen

- One RPC per screen, as listed in §2.1.
- The layout and the page share `getMember()` via React `cache()`, so each request runs one membership lookup.
- `getClaims()` is a local JWT check with no network call.

### 5.2 Rendering

- `cacheComponents` is on. The static shell paints first, and data reads sit inside `<Suspense>` with the existing `RouteSkeleton`.
- `'use cache'` is used **only** for:
  - the community row (AA, AB)
  - `profile_field_defs`
  - the group name, headline, and info posts, invalidated with `updateTag` on save.
- It is never used for messages, unread counts, membership, roles, blocks, notes, album access, or verification (`scaling.mdc`).

### 5.3 Hot writes

- Send, react, and mark-read call RPCs directly from the browser: one HTTPS request to Supabase in the same region.
- Optimistic UI:
  - Send inserts a local row keyed by a client `uuid`, then replaces it with the returned seq.
  - React toggles locally.
- Mark-read runs on open and on leave only (`pagehide`, unmount), never once per incoming message.

### 5.4 Realtime

- One private Broadcast channel `chat:{id}`, only while a thread is open. `send_message`, `edit_message`, `delete_message`, and `toggle_reaction` call `realtime.send()` inside the same transaction.
- Authorization comes from an RLS policy on `realtime.messages` using `is_chat_member(topic uuid)`. It is evaluated once at join, not per message.
- There is no `postgres_changes` subscription, which avoids the per-subscriber RLS re-check.
- **A1 without a per-user channel (recommended change to `performance.mdc`):**
  - A1 refetches `chat_list` on `visibilitychange` → visible, on `focus`, and on back-navigation. Server Components already refetch on navigation.
  - This costs one query per focus, not one write per member per message.
  - If product later wants live A1 badges, the per-user channel can be added with a member-count cap. This is a scaling decision to make after measurement.

### 5.5 Database

- The indexes in §3.2 cover every list query. RLS predicates only touch indexed columns (`community_id`, `user_id`, `chat_id`).
- Two `security definer stable` helpers let Postgres cache per statement, which avoids the nested-RLS cost of joining `members` inside every policy.
- Verify the hot queries with `EXPLAIN ANALYZE` on seeded data before calling each slice done. Targets:
  - A1 < 20 ms
  - thread page < 15 ms
  - search < 50 ms at 5k members

### 5.6 Payload and bundle

- Lists send thumbnail signed URLs. The full image is signed and loaded on tap.
- `supabase-js` in the browser is only needed on screens that write. The composer is already client code, and A1 needs it only for the focus refetch, which can go through `router.refresh()` so no Supabase client is needed. This keeps A1 first-load JS inside 150 KB gzipped.

---

## 6. Security

| Threat | Control |
|---|---|
| Cross-community read | Every table has `community_id`; RLS requires `is_member(community_id)`; every RPC takes and checks community |
| Pending user reads community | RLS requires `state = 'approved'`, except own `members` row and the admin DM |
| Reading chats you're not in | `is_chat_member(chat_id)` on messages, reactions, events, storage `chat/*`, and Realtime topic |
| History leak to new members | `seq > visible_from_seq` enforced in `list_messages` and the RLS policy |
| Member list when disabled | `group_info` returns `members: null` unless `member_list` or admin (server-side, GROUP-006) |
| Notes leak | RLS `author_id = (select auth.uid())` for all operations. No admin override. Stars are never aggregated or exposed (NOTE-004). |
| Album password bypass | `password_hash` column revoked from `anon` and `authenticated`; bucket has no read policy for non-owners; only `openAlbum` signs URLs |
| Password brute force (album) | bcrypt cost 10 (~50–100 ms per check), plus a Vercel Firewall rate-limit rule on the album action path. No custom counter table unless abuse is observed. |
| Login brute force / enumeration | Supabase Auth rate limits, one generic error, username lookup server-only. **Risk:** server-side sign-in makes every login appear to come from Vercel egress IPs, which would pool Supabase's per-IP limits. Before launch, either raise the Auth IP limit and rely on a Vercel Firewall per-client-IP rule, or verify that Supabase honours the forwarded client IP. |
| Blocked user DMs | `open_dm` and `send_message` in a DM check `blocks` in both directions |
| Editing others' posts | `edit_message` requires `author_id = auth.uid()` |
| Service-role leak | Service key only in `lib/supabase/admin.ts` with `import 'server-only'`; used only for the login lookup and album signing; never in `NEXT_PUBLIC_*` |
| Mass assignment | Column-level grants: clients may update only `members.search_filter`, `ad_filter` directly; profile goes through `save_profile`; role and state are only changed by admin RPCs |
| Fake "verified" photo | `camera` is a client claim, stored as-is and displayed as "Camera · date". The spec says do not claim it cannot be faked (VERIFY-005). No server check is claimed. |
| EXIF / location leak | Client re-encodes to WebP or JPEG, which strips EXIF. Bucket rejects other mime types. |
| XSS | React escapes. No `dangerouslySetInnerHTML`. `about` is plain text. |
| CSRF on Server Actions | Next checks the Origin header on actions; cookies are `SameSite=Lax` |
| Secrets | `.env.local` only; `.env.example` lists names. Nothing is committed. |

---

## 7. Scalability

Follow the `scaling.mdc` ladder: measure, then climb one rung.

1. **Now (V1, up to about 10k members per community):**
   - A single Supabase instance.
   - PostgREST's built-in pooling. There is no direct `pg` client, so Supavisor is not needed yet.
   - Stateless Vercel functions: no module-level state, no in-memory rate limits.
2. **First likely bottleneck:** messages table size. Growth estimates:
   - A group posting 1k/day for 3 years is about 1M rows.
   - A PK `(chat_id, seq)` keyset read stays O(log n) at 100M rows.
   - Partition by hash of `chat_id` only if autovacuum or index size becomes a measured problem.
3. **Realtime:** Broadcast to one topic per open chat scales with viewers, not members. Supabase plan quotas (concurrent connections, messages/s) are the ceiling; upgrade the plan before adding infrastructure.
4. **Search:** EAV `exists` filters are bounded by `community_id`. If p95 > 100 ms at scale, add `pg_trgm` for text and a partial index per hot field def before considering a search service.
5. **Signed URL cost:** one batch call per page. If this is measured as slow, cache signed URLs per viewer in memory on the client (already planned) and extend the expiry to 1 h.
6. **Not needed, with reasons:**
   - Redis: nothing is cached that Postgres can't serve in < 20 ms.
   - Queues: the only async work is storage cleanup (`after()`).
   - Read replicas: reads are already one indexed query.
   - Microservices: one team, one database.

---

## 8. Implementation order

One slice per change (`ai-workflow-rules.mdc`). Each slice ships:

- its migration, indexes, and RLS
- pgTAP tests
- replacement of the mock or localStorage bodies
- a typecheck
- a mobile-width happy-path check
- `EXPLAIN ANALYZE` of its hot query

| # | Slice | Depends on | Delivers | Tests (critical) |
|---|---|---|---|---|
| 0 | Foundation | Supabase project in `eu-north-1`, `.env.local` | `supabase/config.toml`, `supabase/migrations/0000_helpers.sql` (`is_member`, `is_chat_member`, pgcrypto), generated `src/lib/supabase/database.types.ts`, `lib/supabase/admin.ts` (server-only), `lib/limits.ts`, `supabase/tests/` harness | helpers return false for non-members |
| 1 | Auth + communities + members | 0 | Join trigger, `username_available`, `signInAction`, `/auth/confirm`, logout, DAL `getMember()`, pending gate; delete `mocks/session.ts` | pending cannot read other members; username unique case-insensitive; login error is generic |
| 2 | Profiles | 1 | Field defs + values, `profile`, `save_profile`, avatar upload (WebP helper), FieldRenderer replaces demo `ProfileFields`, `last_login_at` | value type checked against def; author-only writes; 32k limit |
| 3 | Chats core | 1 | `chats`, `chat_members`, `messages`, `chat_list`, `list_messages`, `send_message`, `mark_read`, Broadcast + Realtime RLS, keyset scroll-back in `ChatThread` | seq monotonic under concurrent sends; unread math; non-member gets 0 rows; history gate |
| 4 | DMs | 3 | `open_dm`, admin DM on join, `leave_chat`, `delete_dm`, `block_user`, `directory`; G2 group variant shows Leave only | block prevents new DM; bilateral delete removes other side's access |
| 5 | Groups + admin | 3 | `save_group`, `delete_group`, `group_info`, `group_info_posts`, `set_group_member`, `admit_member`, F1/F2/A11 wired; `'use cache'` for group info | only community admin creates; member list hidden server-side; history-off new member sees no old posts |
| 6 | Post actions + images | 3 | `toggle_reaction`, who-reacted, `edit_message`, `delete_message`, replies with snippet, chat bucket upload + batch signing, camera flag | edit blocked when `edit_posts` off; admin deletes any; reply cascade |
| 7 | Calendar | 5 | `events` RLS, A4/A12 wired, hidden when `calendar` off | member cannot write; non-member cannot read |
| 8 | Notes + stars | 1 | `notes` RLS, B5 wired | other users (including admin) read 0 rows |
| 9 | Search + filter persistence | 2 | `search_profiles`, `members.search_filter`, G1 wired | cross-community returns 0; filters AND-combine; keyset stable |
| 10 | Albums | 2 | `albums`, `album_images`, bucket, `setAlbumPassword`, `openAlbum` | wrong password returns no paths and no URLs; hash never selectable |
| 11 | Ads | 2, **AD-001 decided** | `ads`, `search_ads`, `members.ad_filter` | age/status come from profile |

**Test tooling within the dependency allowlist:**

- **Database / RLS:** pgTAP through `supabase test db`. pgTAP is a Postgres extension run by the Supabase CLI, not an npm package.
- **Pure TS helpers** (filter serialization, error mapping): `node --test` with built-in type stripping.
- **Nothing else.** No Jest, Vitest, or Playwright, because they are not on the allowlist.

---

## 9. Conflicts, TBDs, and the safe assumption used

| # | Item | Sources | Safe assumption (reversible) |
|---|---|---|---|
| 1 | Ads: posts in a group (transcript) vs A6–D3 screens (mockup) | AD-001 | **Conflict, not resolved here.** UI implements the mockup. Backend slice 11 waits. |
| 2 | Account scope: per community vs platform | COMM-006 | One `auth.users` row per email; username and profile are per community (`members`). Works for both models. A second community with the same email is not supported until decided. |
| 3 | Path vs subdomain | TBD | Path (`/{slug}`), as built. The backend is unaffected (it keys on `community_id`). |
| 4 | 2 vs 3 bottom tabs | TBD | No backend impact |
| 5 | Direct join | GROUP | Flag stored, default `false`. No join RPC until decided. Non-members only view info and DM the admin. |
| 6 | 1 vs 3 main photos | PROF-003 | `photo_paths text[]` capped at 3; UI uses the first |
| 7 | Edit posts in DMs | POST-007 | Off (the group flag is not copied to DMs) |
| 8 | Admin edits others' posts: mockup B3 says "Edit (own or admin)"; POST-008 grants admin delete only | mockup vs stories | **Conflict.** Safe: admin can delete any post but edit only own. |
| 9 | Unchecking "Community" on F1 for an approved member | ADMIN-001 | No revoke. Unchecking an approved member is disabled, because revoking is destructive and undecided. |
| 10 | Forgot password flow and link lifetime | AUTH-006 | Supabase default reset email (1 h) once the flow is approved; UI page missing |
| 11 | Image size limit | SEC-008 | One constant `MAX_IMAGE_BYTES`, proposed 5 MB |
| 12 | Message body limit | not specified | 8000 chars in one constant |
| 13 | Who can contact me | TBD | Not built. Blocks are the only restriction. |
| 14 | User levels 1–3 | TBD | Not modelled; `role` is `member` or `admin` |
| 15 | First-community field list | TBD | Seed file with placeholder defs; real list from product |
| 16 | Max group size | TBD | Not enforced |
| 17 | GDPR export / erase mechanics | TBD | Cascades make erase a single `auth.admin.deleteUser`; export not built |
| 18 | Stars on chat notes: UI shows stars on B5 for chats; NOTE-003 specifies stars on profiles | UI vs stories | Column nullable; accept both; product to confirm |
| 19 | Per-user Realtime channel for A1 (`performance.mdc`) vs O(members) fan-out | rules vs cost | Recommend dropping for V1 (§5.4). **Rule owner to confirm.** |
| 20 | G2 block/delete offered on groups (current UI) vs DM-only (DM-005..007) | UI vs stories | Follow the stories: groups get Leave only |
| 21 | Avatars public vs private | `performance.mdc` lists private for chat/album/verification only | Public bucket with unguessable immutable paths. Flag for privacy review. |

## 10. Things in the current plan that are unnecessary or inefficient

- **A separate verification table or status workflow** is unnecessary. Verification is a camera image in the admin DM (VERIFY-001..003), and `members.state` already records admission.
- **An album-unlock table or unlock cookie** is unnecessary. Signed URLs valid for 1 h are the session unlock. They are never issued without the password.
- **Per-user A1 Broadcast** is inefficient (§5.4).
- **localStorage persistence** for filters, notes, albums, calendar, assignments, and photos is wrong once the backend exists:
  - It is per-device, while stories say "on this account".
  - Data URLs exceed quota.
  - It lets any tab-sharer read "private" notes.
- **JPEG data URLs from `imageDataUrl`** are inefficient. Use WebP Blobs uploaded directly to Storage.
- **Redis, queues, search service, and replicas** are all unnecessary at V1 scale (§7).
