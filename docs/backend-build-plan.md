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

- [x] `profile_values`, `profile_value_options`, `photos` (profile bucket), `profile_links`, `profile_people` (a birth date per person)
- [x] View profile in **one** database call (built-ins + answers + fields for that Status)
- [x] Edit profile: Status at the top decides the fields shown; the member sets it once (then locked), only the community admin can change it (A21)
- [x] Substatuses (client feedback 261013): each Status lists its people (Couple MF = The Man × 1 + The Woman × 1); a field shows in the main section or in each person's section; each person has a birth date and age
- [x] Country → District (per country) → Place; City per district later
- [x] Save checks each answer against its field type, choices and section
- [x] Username shown, not editable
- [x] One profile image (icon + search card): camera = **Taken in app** + date, upload = not Taken in app; resized on the phone (WebP + thumbnail). More photos are photo fields
- [x] Profile score computed on save (default rule)
- [x] "Profile visible in search" toggle
- [x] Basic fields the community admin switches on/off (Status always on), and moves among the fields ("Profile order")
- [x] Profiles show one column in that order; every photo (profile image, photo fields) full width at its place
- [x] Linked profiles: add up to 3, confirmed when the other person links back, remove; unconfirmed links only visible (dimmed) to the owner
- [x] Latest login and "Member since" (account creation date) shown; Reputation not shown

Built with: every write goes through a security definer RPC that checks the caller and validates each answer against its field and section (`save_profile`, `add_profile_photo`, `remove_profile_photo`, `set_profile_link`; admin `set_member_status`, `save_profile_builtins`, `save_community_options` with Status people and per-country districts). Clients have no direct grants on `photos`, `profile_values`, `profile_value_options`, `profile_people`, `profile_links`. Reads: `profile()` (one call per profile) and `profile_cards()` (the A5 list's first page, best score first, until `search_profiles` in step 9). Photos upload straight from the phone to the public `profile` bucket (own folder only, never overwritten); a replaced photo's row is deleted in the same transaction and its files after the response. A27 swipe stays on mock profiles until step 9. Migrations: `20261013120000_profiles.sql`, then `20261014120000_profile_sections.sql` (feedback 261013), then `20261015120000_profile_layout.sql` (basic fields in the profile order). Speed (5,000 couples): `profile()` 1.7 ms, `profile_cards()` 2.4–4.2 ms, `member_names()` 1.2 ms, `save_profile()` 3.3 ms.

**Test it** (two test accounts, phone size; one is the community admin):

*Profile builder (admin → Profile builder)*
1. Substatus list: add "The Kid". Status list: add "Family" with The Woman × 2 and The Kid × 3; save; reopen: the people are kept.
2. Country list: add "Norway". "Districts in Norway": add "Oslo". Sweden's 21 districts are unchanged.
3. Add a field "Male competition level" (short text), "Shown in section for" = The Man only.
4. Basic fields: switch off Profile score → the score disappears from profiles, the list and the filter. Switch it back on.
4b. Profile order: move "Profile image" below "About us" and a photo field to the top → open a profile: the order matches, and both photos are full width at those places. Basic fields switched off show "Hidden" in the order list.

*Own profile (member)*
5. New profile: pick Status Couple MF ("Set status") → it locks; the form shows the main section, then **The Man** and **The Woman**, each with a birth date.
6. Fill in every field type (text, long text, yes/no, pick one, pick several, number, date, photo) → Save → reload → all values are back, in the right sections. "Male competition level" shows only under The Man.
7. A single Status (e.g. Man) shows no section headings, just the fields and one birth date.
8. Country = Sweden (preselected) → District list shows Sweden's districts only.
9. Profile image: take it with the camera → "Taken in app · date", score goes up (+40). Replace it with an upload → no "Taken in app", score goes down (−30). The header icon is the same image.
10. "Profile visible in search" off → you're gone from the other account's Profiles list; back on → you're back.

*Other account / admin*
11. A member can't change their Status once set; the admin can (A21 → Status), and the profile then shows that Status's sections.
12. Linked profiles: link 3 → a 4th is refused. A one-way link isn't shown to others; once both link, it is.
13. The other member sees ages per person, no birth dates, no "Member since"; the admin does see "Member since".
14. Admin → Applications → open a new applicant's profile: it opens (no 404). (Real application records come in step 4.)

---

## Step 4 — Community application and approval

- [x] `applications`, `admin_records` (+ the private `private` bucket for application images, signed URLs only)
- [x] Application form (A25): community application text, image (camera = Taken in app, or upload), message, real name 1/2; required ones from community settings; the profile's required fields must be filled first
- [x] Apply → state `applied`, Apply button dimmed
- [x] "Chat with admin" only once there is an ongoing conversation (the admin has written first); otherwise no button at all, not even dimmed — no chats exist until step 5, so no button yet
- [x] Admin: icon in the Chats header (admin only) → A19 → Applications list (A20) → admin profile view (A21)
- [x] Approve: member gets full access, real names copied to admin records, approval email sent
- [x] Admin records at community level: real names, 3 numbered states (labels from community settings), notes

Built with: RPCs `submit_application`, `decide_application` (approve now; `later`/`rejected` ready, Q5), `admin_roster` (A20 queue / A31 members), `admin_member` (A21), `save_admin_record`, `remove_member`. Applications are readable by the applicant (own) and the community admin; admin records only by the community admin (Q6). Application images upload to `private/{community}/{user}/…` and are signed by the server (1 hour) for the admin after the database confirms the role. The approval email goes out after the response through Brevo's API: set `BREVO_API_KEY` and `EMAIL_FROM` (a sender verified in Brevo) in `.env.local` and on Vercel; without them approval still works and the server logs "Email not sent". Group applications (A22–A24) and group records stay on device until step 7; the A31 member list and A33 statistics read the real community data. Migration `20261016120000_applications.sql`. Speed (5,000 members, 500 open applications): queue 5 ms, members list (2,000 rows) 18 ms, A21 0.5 ms.

**Test it** (two accounts: a new applicant and the community admin; phone size):
1. New account → Welcome/apply screen (A25) shows the community's application text, image, text and real names.
2. Apply before filling in the profile → "Fill in your profile first". Fill in Status + required fields, come back.
3. Apply without an image (or text, or name 1) → "Fill in everything that is asked for".
4. Take the image with the camera → "✓ Taken in app · date"; fill in the rest → Apply → the button turns to "Applied — an admin will review it" and stays dimmed after a reload.
5. As the applicant, try Chats or Profiles in the address bar → you're sent back to the apply screen.
6. Admin: Chats header → admin icon → Applications: the applicant is listed with message and real names.
7. Open them (A21): the profile, then the application image (Taken in app + date), text, real names, Status (changeable), profile states and notes.
8. Fill in a profile state and a note, leave the field, reload → kept. Type letters in a profile state → refused.
9. Approve → "Approved. The member gets an email." → the applicant is gone from Applications and listed under Members, with the real names filled in. With the email keys set, the email arrives.
10. The applicant reloads → full access (Chats, Profiles).
11. A normal member can't see the Applications list or anyone's real names (the admin icon isn't there; the database refuses too).
12. Members list: remove someone → they lose access (their next page load sends them to log in).

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
