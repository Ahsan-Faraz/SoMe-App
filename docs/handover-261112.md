# SoMe — handover (12 Nov 2026)

For the next chat. Read this first, then `docs/backend-build-plan.md` (steps 17 and 18) for detail.

## 1. Where things stand

- **Branch `dev`, last commit `fc496fc` (step 16).** Step 16 is on `main` and deployed to the VPS.
- **Steps 17 and 18 are built and NOT committed** (about 80 changed or new files in the working tree). The user wants everything browser-tested before any commit, deploy or go-live.
- **Six new migrations are already on the dev database** (pushed, not committed). The Vercel test site (`some-app-mu.vercel.app`) still runs step 16 code against that database. It keeps working for existing logins; a login created by the new code can't log in there by email until the new code is deployed.
- **Production (VPS + prod Supabase)** has none of this yet. Domains and Brevo are not set up.

## 2. Rules of the application (do not break these)

**How the user wants the work done**
- Performance, code quality, security, scalability and load are non-negotiable. Read `.cursor/rules/performance.mdc`, `scaling.mdc`, `code-standards.mdc`, `architecture.mdc` before designing or coding. Add database tests and a speed check for new SQL.
- The UI design is frozen (since client feedback 261016). Build behaviour, not new looks. Small additions the client asked for are fine.
- Never touch adult (swingers) communities, domains, data or features. Check `docs/scope-boundaries.md` before any task.
- The user does the manual tests: they log in in the browser pane, Claude drives the checks. The pane has no camera and no file picker.
- Do not commit, push or deploy until the user says so. Never commit to `main`; work on `dev`.
- Client decisions: when the client (Peter) asked for something, that is the decision. When two sources disagree, name the conflict and ask.

**Database**
- No Docker. Migrations go to the linked dev project with `npx supabase db push < /dev/null` (dry-run first). Tests: `npm run test:db` (or `node scripts/test-db.mjs <name>`). Types: `npm run db:types`. Speed: `node scripts/speed-all.mjs`.
- The local CLI is linked to the DEV project. Never `supabase link` to prod. Prod is migrated only by the deploy pipeline (GitHub Actions on `main`: migrate → build → release).
- Migrations only add. Never drop, rename or change the arguments or results of anything an older build calls. Removals wait as SQL in `supabase/deferred/` and are listed in `docs/prod-db-changes-steps-9-11.md`.
- Clients have no grant on `photos`, `logins` or other internal tables. Read them through `security definer` functions, never by embedding from the browser or server client. The service role has no table grants either: use functions.
- Every query is scoped by `community_id`. Lists have explicit columns and a limit. One round trip per screen. RLS uses `(select auth.uid())`.

**Code**
- This Next.js (16.3.6) differs from older versions. Read the guide in `node_modules/next/dist/docs/` before framework code. `cacheComponents` is on: cookies, headers, params and database reads go inside `<Suspense>`; `'use cache'` functions can't read the request.
- `src/proxy.ts` only refreshes the session and rewrites; no database queries in it.
- Pages are thin (`src/app/`), feature code in `src/features/<domain>/`, shared UI in `src/components/`, clients and helpers in `src/lib/`.
- Server data is read from props, never copied into `useState`. Writes call `updateTag` or `refresh`. No new packages.
- Typecheck with `npm run typecheck`. Build with `npm run build`.

## 3. Step 17: sites — addresses and logins per domain (built, uncommitted)

**What it does**
- Each domain is a **site** (`communities.site`, default `main`). A community's address is unique per site, so `theirl.net/demo` and `aiproduktion.se/demo` are two communities. A community never opens on another site's domain.
- A request's site comes from its Host header through the `SITE_HOSTS` setting, never from the database or the browser.
- A **login belongs to one site**. The same email is a separate login, with its own password, on each site. Inside a site one login joins many communities, with a separate account (username, profile) in each.
- Supabase Auth holds an internal address (`<random>@<site>.login.invalid`). The real email and the site are in `public.logins`, unique together.
- Sign-up and reset codes are ours: 6 digits, only a hash stored, one hour, 5 tries, sent through Brevo after the response. Supabase Auth sends no email.
- A sign-up code only confirms in the browser that typed the password (cookie `signup`). A sign-up that was never confirmed is replaced by the next one for that email.
- A password reset keeps the code until the new password is saved, then ends every session of the login.
- A trigger on `members` refuses an account in a community of another site.
- `/platform` lists and creates communities for the domain it is opened on.

**Files**

| File | What it has |
|---|---|
| `supabase/migrations/20261110120000_sites.sql` | `communities.site`, unique (site, slug), `platform_communities(p_site)`, `create_community(p_site, …)` |
| `supabase/migrations/20261110130000_logins.sql` | `logins`, `private.login_codes`, trigger `members_check_site`, new `handle_new_user`, `login_lookup`, `join_prepare`, `login_code_new`, `signup_resend`, `signup_confirm`, `reset_confirm`; `decide_application` reads the real email |
| `supabase/migrations/20261110140000_reset_steps.sql` | `reset_finish`; `reset_confirm` keeps the code |
| `supabase/migrations/20261110150000_login_speed.sql` | `login_lookup` and `join_prepare` use their indexes |
| `supabase/deferred/20261110_drop_siteless_platform.sql`, `…_drop_siteless_logins.sql` | Old functions to drop after the new build is deployed everywhere |
| `src/lib/sites.ts` | `siteForHost`, `requestSite` (reads `SITE_HOSTS`, `DEFAULT_SITE`) |
| `src/lib/auth/logins.ts` | `findLogin`, `newAuthEmail`, holder cookie, `newCode`, `signInAs` |
| `src/features/auth/actions.ts` | Sign-up, login, confirm code, resend, forgot, reset, all per site |
| `src/features/communities/queries.ts` | `getCommunity(slug)` → site + slug lookup, cached per site |
| `src/features/platform/{queries,actions}.ts` | Site-scoped list and create |
| `src/lib/email.ts` | `sendEmail` with a sender per site (`SITE_SENDERS`, else `EMAIL_FROM`) |
| `src/features/account/actions.ts` | Delete account: rate limit keyed by user id |
| `supabase/tests/database/21_sites.test.sql` (13), `22_logins.test.sql` (40) | Tests |
| `scripts/speed/18_logins.sql` | 20,000 logins: every step under 3 ms |

**Warning (also in `docs/prod-db-changes-steps-9-11.md` §5):** every deployment that uses the same database must run the step 17 build before two communities share an address. An older build finds a community by address alone and fails on both.

## 4. Step 18: client feedback 261111 (built, uncommitted)

Source: `SoMe-Test-Guide-261111pm.docx` (repo root, untracked).

**What it does**
- **Back button** goes up one logical level, not to the browser's previous page. Saves and deletes replace the form in history. Privacy terms opened from the join form return to the form.
- **Camera**: starts the stream explicitly, the shutter only works once the picture is really playing, every failure shows why with "Try again", and "Start camera" appears if the phone needs a tap.
- **Profile photos as round icons**: chat posts, chat list header, ad cards.
- **"Taken in app" or "Uploaded" + date and time** under every image.
- A reply to a photo shows that photo small. A DM's name opens the profile. Ad cards show "Looking for". Albums: tap for the whole image; the name field closes after create.
- **Community settings**: the three member-list column names.
- Profile builder: sub-status count can be cleared and retyped.
- **Passwords**: show/hide button and a hint. Rule stays 8+ characters plus the leaked-password check, no forced character mix (decided by the user's instruction to follow best practice).

**Files**

| File | What it has |
|---|---|
| `supabase/migrations/20261112120000_feedback_261111.sql` | `list_messages` and `message_json` + `author_icon`, `reply_photo`; `search_ads`, `member_ads` + `author_icon`, `photo_at`; every photo JSON + `created_at`; `save_community_settings` + optional `state_labels` |
| `supabase/migrations/20261112130000_my_account.sql` | `my_account(p_community)`: the caller's account and profile image in one query |
| `src/lib/history.ts`, `src/components/ui/BackLink.tsx` | `goUp`, `useGoBack`: logical Back |
| `src/features/{albums,groups,fields,chats}/actions.ts` | Redirects after save use `RedirectType.replace` |
| `src/components/camera/CameraCapture.tsx` | The hardened camera |
| `src/components/ui/PasswordField.tsx` | Password input with show/hide and hint |
| `src/lib/photo-label.ts` | `photoLabel`, `photoLabelClass` |
| `src/features/auth/queries.ts`, `types.ts` | `getViewer` uses `my_account`; `Viewer.icon` |
| `src/features/chats/{messages,images,types}.ts`, `components/ChatThread.tsx`, `PictureSheet.tsx`, `ImageViewer.tsx` | Icons, reply photo, labels, captured file passed directly |
| `src/features/ads/{queries,types}.ts`, `components/AdList.tsx` | Icon, Looking for, photo time |
| `src/features/albums/components/{AlbumList,AlbumView,AlbumPhotos}.tsx` | Form closes, full-image view, labels |
| `src/features/communities/{actions}.ts`, `components/CommunitySettingsForm.tsx` | Column names |
| `src/features/fields/components/ListEditor.tsx` | `CountInput` |
| `src/app/platform/page.tsx`, `[community]/privacy`, `terms`, `account/delete` pages | Back links; deleted account lands on the start page |
| `supabase/tests/database/23_feedback_261111.test.sql` (24) | Tests |
| `docs/future-features-261111.md` | Peter's seven "near future" features, documented only |

## 5. What is tested

**Automated (all on the dev database)**
- `21_sites` 13/13, `22_logins` 40/40, `23_feedback_261111` 24/24. All older test files pass except `02_profile_builder`, which fails on Peter's own test data on dev (extra Status, sub-status and field choice). Not a code fault.
- Speed checks within target, except deleting the heaviest account at 2.06 s against 2 s.
- Typecheck and production build pass.

**Browser, passed**
- Same email signs up on two local domains with different passwords; each password is refused on the other domain; a community doesn't open on the other domain.
- Wrong and right confirmation codes; password reset with a code.
- Join a second community with an existing login (wrong password gives the same neutral screen; right password creates the second account).
- Delete the account in one community (login and other account stay), then the last one (login gone).
- Logged in as the admin: chat list and post icons, DM name link and Back, photo labels, group edit → Save → Back, ad cards, community settings load, platform back arrow, album create, camera error screen.

## 6. Testing still needed

1. **Camera on a real phone**, ideally Peter's iPhone: profile image, application image, DM, ad, album. His "Taken in app" DM photo of 11 Nov is completely black, which points to a stream photographed before it played; the fix targets that but is unconfirmed.
2. **With a photo upload** (the pane has no file picker): album full-image view, a reply to a photo showing the photo small, an uploaded photo showing "Uploaded · date, time".
3. **Community settings**: save new column names and see them in the member list and statistics.
4. **Real email delivery** once Brevo is set up: sign-up code, reset code, join notice and approval email arrive, not in spam, at Gmail and Outlook; SPF, DKIM and DMARC pass.
5. **Deleted account lands on the start page**: a one-line change, typechecked, not re-run in the browser.
6. **Older iPhones (before iOS 26)**: Back opens the parent instead of stepping back in history. Check that lists and forms still feel right.
7. **Production smoke test on each domain** after go-live: sign up → apply → approved → chat, and the same email on both domains giving two independent accounts.
8. **Load test**: `docs/load-test-plan.md` section 6.

**Known dev-mode quirk:** on the delete-account page, a wrong password crashes with a Next.js "cookies object" invariant under `npm run dev`. It works on a production build. Test account flows with the `two-sites-prod` launch config.

**Local test setup:** `.claude/launch.json` has `two-sites` (dev) and `two-sites-prod` (build + start). Both map `127.0.0.1` to site `site-b` and switch Brevo off. `localhost` is site `main`. A test account's code can be recovered on dev by trying all 6-digit values against `private.code_hash`. Create temporary communities on `site-b` by SQL and delete them afterwards.

## 7. What is left to do

**A. Waiting for Peter (the user will discuss after the browser test)**
- May a removed member apply again, and does the admin see they were removed? Today they can't log in or join again.
- Keep the application image after approval, per community and per group? Today it is deleted, and the privacy text says so.
- Q13: community picker after login, hidden communities. Q14: confirm sign-up by link or code (code today). Q15: VIP groups of at most 10.

**B. Commit and deploy**
- When the user says so: commit steps 17 and 18 on `dev`, push (Vercel test site updates), then PR `dev` → `main` (pipeline migrates prod and deploys to the VPS).
- Before the prod deploy, the VPS `.env.production` needs `SITE_HOSTS` and `SITE_SENDERS` (see `deploy/vps/env.production.example`).
- After every deployment on a database runs the new build: move the two files in `supabase/deferred/` into migrations and push.

**C. Domains (Oderland cPanel, premium9.oderland.com)** — touch only aiproduktion.se and theirl.net
- aiproduktion.se: change the root A record 91.201.62.9 → `187.124.131.7`; delete the root AAAA `2a02:28f0:304f:2c::`. Keep `www` (CNAME), all MX, mail, TXT and cpanel rows.
- theirl.net: the same root A and AAAA change (the zone exists since it was added as an addon domain).
- Then check it has spread; on the VPS do nginx (`docs/vps-setup.md` Part 9.2) and Certbot HTTPS for both domains plus `www`.

**D. Brevo** (the user now has access)
- Add both domains as senders; add Brevo's DKIM records and code TXT in cPanel.
- SPF for aiproduktion.se: edit the existing record to `v=spf1 ip4:91.201.62.9 +a +mx +include:_vsp.oderland.com include:spf.brevo.com ~all`. Add SPF and DMARC (`v=DMARC1; p=none;`) for theirl.net.
- Put `BREVO_API_KEY`, `SITE_SENDERS` (and `EMAIL_FROM` as fallback) in the VPS env.
- The free plan is 300 emails a day, shared by codes and approvals.

**E. Supabase prod** (`docs/vps-setup.md` Part 10)
- "Confirm email" ON (required). "Allow new users to sign up" OFF (the server creates logins), then one test sign-up. Leaked password protection ON. No SMTP or email templates needed.
- Site URL and redirect URLs for both domains. Check rate limits and that a backup exists.
- Create the communities per domain from `/platform` on that domain (`theirl.net/mtb`, `theirl.net/demo`, `aiproduktion.se/demo`).
- Peter needs a login and a `platform_admins` row on each domain: `insert into public.platform_admins (user_id) select user_id from public.logins where site = '<site>' and email = '<his email>';`
- Decide `DEFAULT_COMMUNITY` per deployment (`/` redirects to it; `demo` exists on both domains).

**F. Later**
- Legal documents from the client (placeholders today).
- The seven future features in `docs/future-features-261111.md`. Not to be built yet.

## 8. Where to read more

- `docs/backend-design.md`: decisions D1–D32, the D17 note on sites and logins, open questions.
- `docs/backend-build-plan.md`: every step with its test list; steps 17 and 18 at the end.
- `docs/prod-db-changes-steps-9-11.md`: live-safe migration record, the step 17 warning, deferred drops.
- `docs/vps-setup.md`, `deploy/vps/`: server, env settings, Supabase prod settings.
- `docs/scope-boundaries.md`: what the team does not work on.
