# SoMe — Backend Build Plan

The step-by-step order for building the backend. Build **one step per chat**, finish it, test it, tick it, then move on. Each step keeps the app working.

- **What** to build and **why**: `docs/backend-design.md` (tables in §4, features in §6).
- **This file**: the **order**, the **checklist**, and the **tests** that prove each step works.

## How every step is done

A step is only finished when all of these are true:

1. **Migration**: tables, indexes and security rules (RLS) in one file in `supabase/migrations/`, applied to the Supabase project.
2. **Database tests**: pgTAP tests in `supabase/tests/database/` pass (`npm run test:db`, which runs them on the linked project without Docker; `supabase test db` also works when Docker is running). They prove the rules: who can and can't read and write.
3. **App wired**: the screen reads and writes real data. Its mock data and `localStorage` code are deleted.
4. **Typecheck** passes (`npm run typecheck`) and **build** passes (`npm run build`).
5. **Manual test**: the step's "Test it" list, done in the browser at phone size, with two test users where needed.
6. **Speed check**: `EXPLAIN ANALYZE` on the step's main query, within the target in `backend-design.md` §11.
7. **Ticked** here, then committed.

Test accounts: use made-up emails (e.g. a `+test` alias of your own email). Never real member data.

---

## Step 0 — Foundation

Nothing visible yet. Sets up everything the other steps use.

- [x] Supabase project in **Stockholm (eu-north-1)**; `.env.local` filled
- [x] Supabase CLI linked to the project; `supabase/config.toml`
- [x] Extensions: `pgcrypto`, `pg_trgm`
- [x] `communities` table + seed **Biking Stockholm**
- [x] Generated types `src/lib/supabase/database.types.ts` (`npm run db:types`)
- [x] `src/lib/supabase/admin.ts` (server-only, service role), `src/lib/limits.ts` (shared length and size limits)
- [x] pgTAP test harness running (`npm run test:db`)

Helper functions moved: each is created with the table it reads (`is_member`, `is_approved`, `is_community_admin` in step 1; `is_chat_member`, `is_group_admin` in step 5).

**Test it:** the start page loads the community name and text from the database, not from `mocks/`.

---

## Step 1 — Accounts (sign up, verify email, log in)

- [x] `members` table (account per community), `platform_admins`
- [x] Helper functions: `is_member`, `is_approved`, `is_community_admin`; platform admin can write `communities`
- [x] Sign up: username + password ×2 + email → member created with state `profile`
- [x] Username check (unique per community, ignores upper/lower case)
- [x] Email verification: 6-digit code typed into the app (works in the installed PWA)
- [x] Log in with **username or email** + password (server-side lookup, one generic error)
- [x] Same email joining a second community: asks for the existing password, creates a new member account
- [x] Log out; forgot password
- [x] `last_login_at` saved on login
- [x] Session check in one place (`lib/auth/dal.ts`); `mocks/session.ts` deleted
- [x] No-reply system account created for the community (and for every new community, by trigger)

**Test it:**
- Sign up → email with a code arrives → typing the code in the app logs you in (on a phone, in the installed app).
- A wrong password gives the same message as an unknown username.
- Username "Anna" and "anna" can't both exist.
- After login, an applicant only sees the Welcome/apply screen.
- Logging out and pressing Back doesn't show member pages.

**Dashboard setup (once):** custom SMTP (Brevo, EU) under Auth → Emails, so templates can be edited and anyone can receive email. Templates **Confirm signup** and **Reset password** show the 6-digit `{{ .Token }}`, typed into the app (a link would open the browser, which on iOS doesn't share the installed PWA's login). Auth → URL Configuration: Site URL `http://localhost:3000` (Vercel URL later).

---

## Step 2 — Profile builder and choice lists (community admin)

- [x] `community_options` (Status, District) + seed: Man, Woman, Other, Couple MF/MM/FF (couples = 2 people); District = Sweden's 21 regions
- [x] `profile_fields`, `profile_field_options`
- [x] Admin screen: add, edit, order and retire fields (all 8 types; required, searchable, on card, per person, which Statuses)
- [x] Admin screen: edit the Status and District lists
- [x] Field definitions cached per community, refreshed on save
- [x] Seed the Biking Stockholm fields

Built with: writes through three admin RPCs (`save_profile_field`, `save_community_options`, `reorder_profile_fields`); no client can delete a field, choice or list entry (retire only); key, type and community of a field never change. The profile screens read the cached builder (`features/fields/queries.ts`, service role read-only); answers stay device drafts until step 3.

**Test it:**
- The admin adds a "pick one" field → it appears on profiles.
- A field limited to "Couple MF" only shows for that Status.
- A normal member can't open the builder (the database refuses, not just the button).
- Retiring a field keeps the old answers.

---

## Step 3 — Profiles

- [ ] `profile_values`, `profile_value_options`, `photos` (profile bucket), `profile_links`
- [ ] View profile in **one** database call (built-ins + answers + fields for that Status)
- [ ] Edit profile: Status at the top decides the fields shown; the member sets it once (then locked), only the community admin can change it (A21); couples answer per-person fields twice and enter 2 birth dates
- [ ] Save checks each answer against its field type and choices
- [ ] Username shown, not editable
- [ ] Profile icon + 3 main photos: camera = **Taken in app** + date, upload = not Taken in app; resized on the phone (WebP + thumbnail)
- [ ] Profile score computed on save (default rule)
- [ ] "Profile visible in search" toggle
- [ ] Linked profiles: add up to 3, confirmed when the other person links back, remove; unconfirmed links only visible (dimmed) to the owner
- [ ] Latest login shown; Reputation not shown

**Test it:**
- Fill in every field type → save → reload → all values are back.
- Changing Status from Man to Couple MF shows the second birth date and the per-person fields.
- A 4th linked profile is refused.
- A camera photo shows "Taken in app · date"; an uploaded one doesn't.
- A member can't change their Status once set (the database refuses); the community admin can.
- A one-way link doesn't appear on the profile for other members; once both have linked, it does.
- Score goes up after adding a Taken in app main photo.
- Another member can't change your profile (the database refuses).

---

## Step 4 — Community application and approval

- [ ] `applications`, `admin_records`
- [ ] Application form (A25): community application text, image (camera = Real, or upload), message, real name 1/2; required ones from community settings
- [ ] Apply → state `applied`, Apply button dimmed
- [ ] "Chat with admin" only once there is an ongoing conversation (the admin has written first); otherwise no button at all, not even dimmed
- [ ] Admin: icon in the Chats header (admin only) → A19 → Applications list (A20) → admin profile view (A21)
- [ ] Approve: member gets full access, real names copied to admin records, approval email sent
- [ ] Admin records at community level: real names, 3 numbered states (labels from community settings), notes

**Test it:**
- Applicant applies → appears in the admin queue.
- Applying twice isn't possible.
- The applicant can't open chats or profiles before approval.
- Approve → email arrives → full access.
- Another member can't read the application or the real names.

---

## Step 5 — Chats (core) and live messages

- [ ] `chats`, `chat_members`, `messages`
- [ ] Helper functions: `is_chat_member`, `is_group_admin`
- [ ] Chat list (A1) in one call: unread first, then newest; unread number without counting
- [ ] Chat page: newest 30, older ones load on scroll up
- [ ] Send text: instant on screen, message numbers stay in order
- [ ] Mark as read when opening and leaving the chat
- [ ] Live delivery: private Broadcast channel for the open chat only; reconnect catches missed messages
- [ ] Post header: username **(status)** · date + time
- [ ] Chat list refreshes when the app is reopened

**Test it (two phones or two browsers):**
- User A sends → User B sees it within about a second with the chat open.
- Unread badge counts are right and clear on open.
- Scrolling up loads older messages without duplicates.
- Turn Wi-Fi off and on → missed messages appear.
- A non-member gets nothing, even by calling the database directly.

---

## Step 6 — DMs and blocking

- [ ] Find or create a DM (refused when blocked or still an applicant)
- [ ] `blocks`
- [ ] Leave DM: "Keep chat, block writing" / "Delete chat, block user" (deleted for both)
- [ ] A block hides your profile from that person everywhere (profiles, search, member lists, ads)
- [ ] Private notes ⭐ from a DM open the same notes as the person's profile (built fully in step 10)

**Test it:**
- After "Keep chat, block writing", neither person can send, and the history stays.
- After "Delete chat", the other person's chat is gone too.
- The blocked person no longer finds you in search.

---

## Step 7 — Groups and group applications

- [ ] Create group (community admin or members with group-create rights); creator becomes the group admin (one per group)
- [ ] Edit group (A10): name, headline, application text, Info 1–3, every setting, 3 profile-state labels, "Save"
- [ ] Group info (G3): headline, info posts, member list + count if allowed, Leave group
- [ ] Info bar in the chat: calendar + Info 1 headline
- [ ] Group application (A24) → group admin queue (A23) → admin view (A22) → approve adds the member and sends a No-reply DM
- [ ] Direct join when the group allows it
- [ ] History setting: new members don't see old posts when it's off
- [ ] Community admin: give group-create rights, set the group admin; "Add to groups" (F1) by role

**Test it:**
- A member without rights can't create a group.
- With history off, a new member sees only new posts.
- With the member list off, normal members can't get the list, even directly.
- Approving a group application adds the member and sends the No-reply DM.

---

## Step 8 — Post actions and chat images

- [ ] `reactions`: one per person, changeable; any emoji; counts kept on the message
- [ ] "Details": who reacted
- [ ] Comments: reply with a snippet of the original post; deleting a post deletes its comments
- [ ] Edit own post (if the group allows editing); delete own post; admins delete any post
- [ ] Group switches respected: posting, commenting, reactions
- [ ] Chat images: camera (Taken in app) / upload / from profile/album (copied); private bucket; thumbnail in the chat, full image on tap
- [ ] Reactions and edits arrive live

**Test it:**
- Reacting twice with different emoji keeps one reaction (the latest).
- With editing off, the edit is refused.
- An admin deletes someone's post → it disappears for everyone.
- A non-member can't open a chat image URL.

---

## Step 9 — Search, filters, swipe, find new

- [ ] `search_profiles` in one call: Status, Looking for, age range, District (multi), Place, Profile score min, My stars min–max, searchable builder fields, text in a field
- [ ] Filter applies on "Show"; saved on the account
- [ ] Profiles list cards: username · age · status / district + place / photo + Taken in app / score · my stars / looking for
- [ ] Swipe browse (A27): next, previous, star-rate and move on
- [ ] Find new user/group: empty until typing, only people/groups you're not connected to, Users/Groups filter, respects visibility and blocks

**Test it:**
- Combine 3 filters → only matching profiles show.
- Hidden profiles and blocked people never appear.
- Ages are right around birthdays.
- With 5,000 seeded members, search answers in under 50 ms.

---

## Step 10 — Private notes and stars

- [ ] `notes`: text + 1–5 stars, author only
- [ ] The same notes from the profile ⭐ and the DM ⭐
- [ ] Stars appear on profile cards and power the "My stars" filter

**Test it:**
- Another member, **including an admin**, gets 0 rows when reading your notes.
- A star set in swipe mode shows on the profile.

---

## Step 11 — Member lists, door list, statistics

- [ ] One list screen (A30/A31) for group or community members and applications
- [ ] Rows: username, status, real names, 3 states + notes, editable in the row; remove; + add
- [ ] Statistics (A28 group, A33 community): member count, count per Status, sums of the 3 states

**Test it:**
- An edit in the list saves and survives a reload.
- A group admin sees only their own groups.
- The statistics numbers match the list.

---

## Step 12 — Calendar

- [ ] `events`: month view with marked dates
- [ ] Group admin: add, edit, delete (with a confirm)
- [ ] "DM Admin" on an event opens a DM with its creator
- [ ] Hidden when the group's calendar is off

**Test it:**
- A member can't add an event.
- Delete asks first.
- DM Admin opens the right person.

---

## Step 13 — Albums

- [ ] `albums`, `album_photos`
- [ ] + menu: Camera (Taken in app) / Upload image / Delete album; 🗑 on each photo
- [ ] Password: set it, and open only after the server checks it (signed links valid 1 hour)
- [ ] Locked albums show a folder icon, never a photo

**Test it:**
- A wrong password returns no photos.
- The password hash can never be read.
- A locked album never leaks a cover image.

---

## Step 14 — Ads

- [ ] `ads`: looking for (multi), headline, text, district, place, image (camera / upload / from profile/album)
- [ ] Age, status and score come from the author's profile
- [ ] `search_ads` + filter (same engine as profiles), saved on the account
- [ ] My ads; edit; delete; Profile and DM buttons on others' ads

**Test it:**
- Changing your age updates it on your ads.
- The filters work.
- Ads from blocked people don't show.

---

## Step 15 — Launch checks

- [ ] Cookie notice + privacy page link on the start page
- [ ] Delete my account (removes data and files)
- [ ] EU email provider live (custom SMTP); Auth rate limits set (login runs on the server, so Supabase sees the server's IP for every user: raise the sign-in limit or add our own per-IP limit)
- [ ] Leaked password protection on (Auth settings)
- [ ] Sender on our own domain, authenticated in Brevo (DKIM + DMARC); not a Gmail address
- [ ] Load test: 100 users online sending messages; check Realtime and query speed
- [ ] Every main query checked with `EXPLAIN ANALYZE` against the targets
- [ ] Switch Supabase to the **Pro** plan before real users
- [ ] Back up the database

**Test it:** a full run-through as a new user (sign up → apply → approved → profile → chat → group → album → ad), on a real iPhone and a real Android phone.
