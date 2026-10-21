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

- [x] `community_options` (Status, District) + seed: Man, Woman, Other, Couple MF/MM/FF; District = Sweden's 21 regions ("2 people" and "per person" were replaced by substatuses in step 3)
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

Built with: every write goes through a security definer RPC that checks the caller and validates each answer against its field and section (`save_profile`, `add_profile_photo`, `remove_profile_photo`, `set_profile_link`; admin `set_member_status`, `save_profile_builtins`, `save_community_options` with Status people and per-country districts). Clients have no direct grants on `photos`, `profile_values`, `profile_value_options`, `profile_people`, `profile_links`. Reads: `profile()` (one call per profile) and `profile_cards()` (the A5 list's first page, best score first, until `search_profiles` in step 9). Photos upload straight from the phone to the public `profile` bucket (own folder only, never overwritten); a replaced photo's row is deleted in the same transaction and its files after the response. A27 swipe shows the real members since feedback 261016 (basic fields only; answers with `search_profiles` in step 9). Migrations: `20261013120000_profiles.sql`, then `20261014120000_profile_sections.sql` (feedback 261013), then `20261015120000_profile_layout.sql` (basic fields in the profile order). Speed (5,000 couples): `profile()` 1.7 ms, `profile_cards()` 2.4–4.2 ms, `member_names()` 1.2 ms, `save_profile()` 3.3 ms.

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
- [x] "Chat with admin" only once there is an ongoing conversation (the admin has written first); otherwise no button at all, not even dimmed (real since step 5: `admin_chat`)
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

### Feedback 261016 (after steps 3–4; the design is locked after this round)

- [x] Linked profiles: a short comment (60 characters) of yours next to each link, edited on A32 and shown on the profile (`set_profile_link_comment`)
- [x] Applying: the profile fields still missing are listed by name, on the apply screen, in the refused-apply message and on your profile; required fields (Status and the fields the admin marks Required in the builder) carry a "Required" tag in the profile editor
- [x] After applying, the apply screen shows what was sent: image (signed for you), text, real names (`my_application`)
- [x] Demo data: swipe (A27) and "Find new user" (A2) show the real members instead of mock people (swipe shows the basic fields until step 9 brings answers). Mock chats went in step 5; mock groups and calendar go with steps 7 and 12
- [x] The admin's DM to an applicant wasn't visible: chats were still mock data. Real since step 5 (the admin DMs from A21, the applicant answers from "Chat with admin")

Migration `20261017120000_feedback_261016.sql`; tests `05_feedback_261016.test.sql` (02 and 03 now ignore "Test …" rows on the live project).

---

## Step 5 — Chats (core) and live messages

- [x] `chats`, `chat_members`, `messages`
- [x] Helper functions: `is_chat_member`, `is_group_admin`
- [x] Chat list (A1) in one call: unread first, then newest; unread number without counting
- [x] Chat page: newest 30, older ones load on scroll up
- [x] Send text: instant on screen, message numbers stay in order
- [x] Mark as read when opening and leaving the chat
- [x] Live delivery: private Broadcast channel for the open chat only; reconnect catches missed messages
- [x] Post header: username **(status)** · date + time (the status on group posts; DMs show the name only)
- [x] Chat list refreshes when the app is reopened
- [x] Pulled forward from step 6 so chats exist: find or create a DM (`open_dm`; blocks are added in step 6). The community admin can DM an applicant; the applicant can answer, and gets "Chat with admin" on A25, once the admin has written

Built with: no client grants on the three tables; every read and write is an RPC that checks the caller's chat membership (an account still in the community) and the community: `chat_list`, `chat_header`, `list_messages` (newest page, older page with `before`, catch-up with `after`), `find_dm`, `admin_chat`, `open_dm`, `send_message`, `mark_read`. `send_message` locks the chat row to number messages in order, saves a retry once (`client_id` made on the phone) and broadcasts the message on the private channel `chat:{id}` in the same transaction (`realtime.send`); joining that channel is allowed by a policy on `realtime.messages` for chat members only (`private.can_listen`). The phone shows a message at once ("Sending…", "Not sent. Tap to try again."), joins the channel of the open chat only, and catches up after a reconnect, on coming back to the app and when back online. Reactions, comments, edit/delete and chat images stay hidden until step 8; mock chats are deleted (mock groups stay in "Find new user/group" until step 7). Migration `20261018120000_chats.sql`, tests `06_chats.test.sql`. Speed (`scripts/speed/06_chats.sql`: 5,000 members, 120,865 messages, a user in 200 chats, a 5,000-message chat): chat list 2.7 ms, header 0.5 ms, newest page 0.8 ms, older page 1.3 ms, catch-up 2.0 ms, send 1.5 ms, mark read 0.3 ms.

Note: Realtime keeps broadcasts in daily partitions of `realtime.messages` that it creates once a phone has connected; until then a send still saves but its broadcast is dropped with a warning. The two broadcast checks in `06_chats.test.sql` check the stored broadcast once partitions exist.

**Test it (two phones or two browsers):**
- User A sends → User B sees it within about a second with the chat open.
- Unread badge counts are right and clear on open.
- Scrolling up loads older messages without duplicates.
- Turn Wi-Fi off and on → missed messages appear.
- A non-member gets nothing, even by calling the database directly.

Tested 2026-10-16 with two users in two browser tabs: delivered live in 331 ms and 678 ms; unread 2 shown, cleared after opening; 42 messages paged with no duplicates; missed messages caught up when coming back to the chat (the same catch-up a reconnect uses; a real Wi-Fi drop still to try on a phone); non-members: 10 database tests.

---

## Step 5b — Own domains, real members and privacy basics

The platform stays generic: each community admin builds their own community (any club or interest). These features apply to every community. Nothing here is built for one kind of community.

Domains
- [x] `communities.domain` (unique, lower-case host, nullable): a community can have its own domain (e.g. `club-example.com`); without one it stays at the platform path `/{slug}` as today
- [x] `src/proxy.ts`: a known custom host is **rewritten** to `/{slug}/…`, so `club-example.com/chats` serves `/[community]/chats`; `/` on that host opens the community's start page. The host → slug map comes from a setting (`COMMUNITY_DOMAINS`, e.g. `club-example.com=biking-stockholm`), not the database: the proxy stays free of database queries (project rule). A path already starting with the community's slug passes through; another community's slug is a 404 on that domain
- [x] The platform's `/` redirect is a setting (`DEFAULT_COMMUNITY`, default `biking-stockholm`) and skips own domains
- [x] Per-community app name: page `<title>`, iOS home-screen title and the manifest (`/{slug}/manifest.webmanifest`, start page) come from the community; icons stay the platform's until communities have their own. The email sender name was already the community's
- [x] The approval email link and redirects use the domain the admin works on
- [ ] Later (cosmetic, not needed to work): one link helper so links on an own domain drop the `/{slug}` prefix (about 176 links in 73 files). Today they keep it, and the proxy lets them through

Real members: 18+ and identity (community settings)
- [x] Community settings: `require_age_18` and `require_identity` (on/off per community). Set by the platform admin in the database for now, like `require_app_*`; a settings screen for the community admin comes with the community settings screen (not built yet for any setting)
- [x] **18+**: a confirmation at sign-up when the community requires it (BankID later, see "Later")
- [x] **Identity check**: when required, the application asks for an ID photo (camera or upload) into the private bucket. Shown on A21 to the community admin (signed URLs, one call for both images); no automatic face matching
- [x] **Identity material is short-lived**: on approve or reject (not "later"), and when an applicant is removed, the application image and the ID photo are deleted (rows in the transaction, files after the response by the server). A21 then shows "Checked and deleted · date · who decided"

Privacy basics (before real users)
- [x] **Join never reveals an existing email.** A wrong password for an existing email shows the same "enter the code" step as a new email; the owner gets an email explaining it. Resending a code answers the same either way (only the rate limit is told apart)
- [x] **Consent at sign-up**, stored per member: the privacy terms (with their version, `communities.privacy_version`) + 18+ when required, in `member_consents`, in the same transaction as the account (sign-up trigger, or `join_community` for an existing login; the direct insert into `members` is gone). Terms of use are added when the client provides them
- [ ] Decide: **profile photos private?** Today the `profile` bucket is public with unguessable URLs (anyone holding a link can open it). Alternative: private bucket + signed URLs (batched, one call per page), at some cost in image speed (open question to the client)

Built with: migration `20261019120000_real_members.sql` (`member_consents`, `private.save_consents`, `join_community`, `private.drop_application_media`; `submit_application`, `decide_application`, `admin_member`, `my_application` updated; `remove_member` now returns the files) and `20261019130000_photo_fk_indexes.sql` (the four foreign keys to `photos` were not indexed: deleting a photo scanned `members`, `profile_values` and `applications`). Tests `07_real_members.test.sql` (38); every earlier test file signs up with consents. Speed (`scripts/speed/07_real_members.sql`: 5,000 members, 10,000 consents, 1,000 open applications): sign-up 0.9 ms per member, A21 0.9 ms, applications list 3.5 ms, approve with image deletion 2.5 ms (5.7 ms before the indexes), own application 0.5 ms. Domain routing checked on a production build with `Host` headers (own domain `/`, `/login`, `/join`, `/privacy`, slug paths pass through, another community 404, per-community title and manifest).

Settings to add where the app runs: `COMMUNITY_DOMAINS` (when a community gets its own domain) and optionally `DEFAULT_COMMUNITY`.

Not done here: 3 applications approved before this step still have their images (test data from step 4); delete them once (rows + files) or leave them. Older app builds can't sign anyone up any more (they don't send consents): deploy this code together with the migration.

**Test it:**
- `club-example.com/chats` (a test host mapped in the hosts file) opens the community's chats; links stay on the domain without `/{slug}`; the platform path `/{slug}/chats` still works.
- With identity required, applying without an ID photo is refused; after approval the ID photo and application image are gone from Storage and the database.
- With 18+ required, sign-up can't finish without the confirmation; it is stored with its version.
- Joining with an email that has a login elsewhere gives the same answer as a new email.

---

## Step 6 — DMs and blocking

- [x] Find or create a DM (refused when blocked or still an applicant): `open_dm` refuses when either has blocked the other
- [x] `blocks` (one row per block; primary key = "did I block them", index = "did they block me"; readable by the blocker only, written only by `leave_chat`)
- [x] Leave DM: "Keep chat, block writing" (read only for both, history stays) / "Delete chat, block user" (deleted for both, messages too); either way the other person is blocked and the profile links between the two are removed. The other person's open chat is told at once (Realtime `blocked` / `deleted`)
- [x] A block hides the two from each other: profile, Profiles list, swipe, "Find new user", name search, linked profiles; linking is refused (answered like an unknown member). The community admin still sees everyone. Search (step 9) and ads (step 14) add the same check
- [x] Private notes ⭐ from a DM open the same notes as the person's profile (since step 5; built fully in step 10)
- [x] Leave group: removes your own membership (the group admin can't leave); groups arrive in step 7
- [x] Chat "left" / "blocked" on this device (`features/chats/hidden.ts`, localStorage) deleted: it all comes from the database now

Built with: migration `20261020120000_blocks.sql` (`blocks`, `private.blocked_pair`, `leave_chat`; `open_dm`, `send_message`, `profile`, `profile_cards`, `member_names`, `set_profile_link` and `chat_header` (+ `blocked`) check blocks), then `20261020130000_member_names_search.sql`: the name search found matches through the trigram index instead of walking every member in name order (14 ms → 1.5 ms at 5,000 members). Tests `08_blocks.test.sql` (40). Speed (`scripts/speed/08_blocks.sql`: 5,000 members, 20,400 blocks, the viewer blocked 200 and blocked by 200): Profiles list 4.0 ms, name search 0.8–1.5 ms (6.0 ms when a fifth of all members match), profile 1.8 ms (a blocked one 0.1 ms), send 1.2 ms, chat header 0.6 ms.

Not in the spec yet: unblocking (a "blocked people" list could read the blocker's own rows). Browser-tested 2026-10-21 (see the review of steps 5b–8).

**Test it:**
- After "Keep chat, block writing", neither person can send, and the history stays.
- After "Delete chat", the other person's chat is gone too.
- The blocked person no longer finds you in search.

---

## Step 7 — Groups and group applications

- [x] Create group (community admin or members with group-create rights); creator becomes the group admin (one per group)
- [x] Edit group (A10): name, headline, application text, Info 1–3, every setting, 3 profile-state labels, "Save"; "Delete group" (asked first)
- [x] Group info (G3): headline, info posts, member list + count if allowed (admins always), Leave group (not for its group admin)
- [x] Info bar in the chat: calendar + Info 1 headline (from the chat header, one call)
- [x] Group application (A24) → group admin queue (A23) → admin view (A22) → approve adds the member and sends a No-reply DM; nobody can answer the No-reply DM
- [x] Direct join when the group allows it
- [x] History setting: new members don't see old posts when it's off
- [x] Posting setting enforced on send (group admins and the community admin may always post); commenting, reactions and editing are kept for step 8
- [x] Community admin: give group-create rights, set the group admin (`set_group_admin`; no screen for it yet); "Add to groups" (F1) by role: settings + every group for the community admin, only their own groups for a group admin
- [x] The group's screens (A10, A22, A23, A28, A30, "+") open for its group admin as well as the community admin; group admins run the group's calendar
- [x] Group mock data and the device-only rosters (`src/mocks/data.ts`, `features/membership/storage.ts`) deleted

Built with: migration `20261021120000_groups.sql`: group settings on `chats`, `group_info_posts`, applications linked to their group (+ the group admin's queue index). `private.can_manage_group` (group admin or community admin) guards every group RPC: `save_group`, `delete_group`, `group_settings`, `group_info` (G3 + B2 in one call), `group_card` (A24), `group_directory` (A2), `group_assignments` (F1), `group_roster` (A23/A30), `group_member` (A22), `join_group`, `apply_to_group`, `save_group_record`, `set_group_member`, `set_group_admin`, `set_group_rights`. `decide_application` decides group applications (by the group's admins), `send_message` enforces posting and No-reply, `chat_header` carries the rules and the info bar, `chat_list` shows a group from its first minute. Group admin records use the group's id as scope. Tests `09_groups.test.sql` (59). Speed (`scripts/speed/09_groups.sql`: 5,000 members, 200 groups, one with 2,001 members, 500 open applications, 5,000 messages): G3 13.8 ms (first 500 members + count), roster 13.3 ms (2,001) / 4.5 ms (500 applications), A22 1.2 ms, chat header 1.4 ms, send 1.4 ms, approve + No-reply DM 3.3 ms, edit 1.2 ms, directory 0.8 ms, A24 0.8 ms.

Also fixed on the way: the Realtime broadcast test now checks for today's partition (Realtime makes one per day while phones are connected).

Not done here: a screen for the community admin to pick a group's admin (the RPC exists); the calendar's events stay on the device until step 12. Browser-tested 2026-10-21 (see the review of steps 5b–8).

**Test it:**
- A member without rights can't create a group.
- With history off, a new member sees only new posts.
- With the member list off, normal members can't get the list, even directly.
- Approving a group application adds the member and sends the No-reply DM.

---

## Step 8 — Post actions and chat images

- [x] `reactions`: one per person, changeable; any emoji; counts kept on the message (a trigger keeps them right, cascades included)
- [x] "Details": who reacted (the first 100 by name)
- [x] Comments: reply with a snippet of the original post (copied at send); deleting a post deletes its comments (and theirs)
- [x] Edit own post (if the group allows editing; its admins may always); delete own post; the group's admins delete any post in it
- [x] Group switches respected: posting, commenting, reactions, editing (refused by the database; the menu only offers what is allowed)
- [x] Chat images: camera (Taken in app) / upload / from profile/album (copied); private bucket; thumbnail in the chat at its own shape (no 16:9 crop), full image on tap
- [x] Reactions, edits and deletions arrive live (`reaction`, `edited`, `removed` on the chat's channel)
- [x] Deleting a post, a DM ("Delete chat") or a group also deletes its pictures' files (the server removes them after the response)

Built with: migration `20261022120000_post_actions.sql`: `messages` + `photo_id`, `reply_to_seq` (self-referencing, cascade), `reply_snippet`, `reactions` (counts), `edited_at`, body optional when there is a photo; `reactions` table + count trigger; `send_message` (+ comment, photo), `list_messages` (+ photo, comment's author and snippet, counts, your reaction), `set_reaction`, `reaction_details`, `edit_message`, `delete_message` (the whole comment thread), `leave_chat` / `delete_group` now return their image files. Chat images: storage policy `private_chat_photos_read` (`private.can_read_chat_photo`: a member who can see a post using the file); the server signs a page's thumbnails in one call, the phone signs live ones and the full image on tap. File deletion lives in a server-only module (`features/chats/files.ts`), never a Server Action. Tests `10_post_actions.test.sql` (47). Speed (`scripts/speed/10_post_actions.sql`: 2,000 members, 5,000 posts, 1,000 photos, comments, 2,000 reactions): newest page 2.7 ms, older page 3.2 ms, react 1.0 ms, Details 2.4 ms, edit 1.0 ms, image check 0.7 ms per file, delete 2.5 ms (best of 5; the post with 100 comments was not timed on its own).

"From profile/album" copies the picture into the chat: album photos are still on the device until step 13. Browser-tested 2026-10-21 (see the review of steps 5b–8).

**Test it:**
- Reacting twice with different emoji keeps one reaction (the latest).
- With editing off, the edit is refused.
- An admin deletes someone's post → it disappears for everyone.
- A non-member can't open a chat image URL.

---

### Review of steps 5b–8 (2026-10-23)

Database audit: RLS on every table, every security definer function has a fixed `search_path`, anon runs no public function, client write grants only where RLS checks the admin. Fixed (migration `20261023120000_review_fixes.sql`, tests `11_review_fixes.test.sql`):
- [x] Own domains: files (`/community/hero.png`…) and Next.js internals are never rewritten to a community page (they returned 404 on an own domain)
- [x] The join form's "this email already has a login" notice goes out at most once an hour per address (`join_notice_due`, a hash of the address only): it could have been used to flood someone's inbox
- [x] Group applications closed by adding or removing the person directly (A30 "+", F1), and a deleted group's applications, now delete their images too
- [x] Index for a group's applications (deleting a group scanned them all)
- [x] One server-only helper deletes private files for chats, groups and applications (`lib/supabase/private-files.ts`; it was in two places, once wrongly exported from a Server Action file)
- [x] The No-reply DM shows no ⭐ notes or Leave (there is no person behind it)

Browser test of steps 5b–8 (2026-10-21, two users): join form, groups (create, apply, approve, No-reply DM, history off, roster), post actions (live post, react / change / take back, Details, comment with quote, edit, delete with comments, picture with thumbnail and full view, file removed from Storage, reactions switch off), block (keep chat / delete chat, hidden from each other, live). Fixed (migration `20261024120000_history_preview.sql`, tests `12_history_preview.test.sql`):
- [x] With history off, the chat list showed a new member the group's last post from before they joined

---

## Step 9 — Search, filters, swipe, find new

Pulled forward from step 10 (decided 2026-10-21): the `notes` table and `set_note`, because three of this step's items use stars (the filter, the cards, swipe rating). `search_profiles` is the hottest query; building it once with the notes join avoids rewriting it, re-indexing and redoing the speed check in step 10. The notes screens stay in step 10.

- [ ] `notes` (community, author, subject, text, stars 1–5), primary key `(community_id, author_id, subject_id)`; RLS: only the author reads it; written only through `set_note`
- [ ] `search_profiles` in one call: Status, Looking for, age range, District (multi), Place, Profile score min, My stars min–max, searchable builder fields, text in a field
- [ ] Filter applies on "Show"; saved on the account
- [ ] Profiles list cards: username · age · status / district + place / photo + Taken in app / score · my stars / looking for
- [ ] Swipe browse (A27): next, previous, star-rate (`set_note`) and move on
- [ ] Find new user/group: empty until typing, only people/groups you're not connected to, Users/Groups filter, respects visibility and blocks

**Test it:**
- Combine 3 filters → only matching profiles show.
- Hidden profiles and blocked people never appear.
- Ages are right around birthdays.
- With 5,000 seeded members, search answers in under 50 ms.

---

## Step 10 — Private notes and stars

The `notes` table, `set_note`, card stars and the "My stars" filter come in step 9. This step is the notes screens.

- [ ] The profile ⭐ and the DM ⭐ open the same note from the `notes` table (text + 1–5 stars); their `localStorage` code is deleted

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
- [ ] Sender on our own domain, authenticated in Brevo (DKIM + DMARC); not a Gmail address (one per community domain, see below)
- [ ] Load test: 100 users online sending messages; check Realtime and query speed
- [ ] Every main query checked with `EXPLAIN ANALYZE` against the targets
- [ ] Switch Supabase to the **Pro** plan before real users
- [ ] Back up the database
- [ ] Each community domain added to the Vercel project (DNS records at the registrar, HTTPS automatic)
- [ ] Supabase Auth: Site URL and redirect allow-list list every domain; `COMMUNITY_DOMAINS` set on Vercel
- [ ] Vercel **Pro** (Hobby is non-commercial only)
- [ ] Legal, by the client (not code): data processing agreement with each community admin, privacy policy naming Supabase/Vercel/Brevo and the transfer basis, breach runbook (IMY within 72 hours), contact point + report flow (DSA)

**Test it:** a full run-through as a new user (sign up → apply → approved → profile → chat → group → album → ad), on a real iPhone and a real Android phone.

---

## Later (privacy, when the app takes off)

Deliberately not built yet: BankID age/identity check (an option per community; decide who pays), audit log of who viewed whose profile and identity material (exportable to the community admin), admin roles (e.g. owner/admin/verifier), self-service data export, retention jobs for chat and old accounts, per-field visibility + "as others see me". Report a post/profile comes with blocking (step 6) and post actions (step 8).

Open questions for the client:
1. Profile photos: visible to logged-in members only (private bucket), or keep public unguessable links?
2. Identity check: ID card photo, a photo of the person, or both?
3. Later, who pays for BankID checks: members or community admins?
