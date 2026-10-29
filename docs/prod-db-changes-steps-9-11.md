# Database changes for production: steps 9–11

Local development and the live site share **one** Supabase project. A migration pushed during a step changes the live database at once, while the live site keeps running an older build until the code is deployed (when the PM asks). So:

- A migration for a step that isn't deployed yet only **adds**: new tables, columns with defaults, new functions, indexes. It never drops or renames anything, and never changes what an existing function takes or returns, if the live build uses it.
- What has to go waits as SQL in `supabase/deferred/`, outside `supabase/migrations/`, so `db push` never runs it by accident. Once its step ships, it moves into `supabase/migrations/` with the code and is pushed after the deploy (section 2).

(Older migration comments call this file `docs/deferred-migrations.md`; that was its first name.)

## 1. Already in the database (nothing to run)

These are applied to the shared project and are safe for the old build. Deploying the code is all they need.

| Step | Migration | What it adds or changes |
|---|---|---|
| 9 | `20261025120000_search.sql` | `notes` table (author-only RLS) + `set_note`; `members.search_filter` (default `{}`) + `save_search_filter`, `search_filter`; `search_profiles`; `find_new`; index `chats_group_name_trgm`. It also dropped `profile_cards` and `group_directory`, which the old build calls; the next row but one puts them back. |
| 9 | `20261025130000_search_speed.sql` | Faster `search_profiles` and `find_new` (same arguments and results). |
| 9 | `20261025140000_live_compat.sql` | Restores `profile_cards` and `group_directory` unchanged, for the old build. |
| 10 | none | The notes screens use the step 9 table and `set_note`. |
| 11 | `20261026120000_rosters.sql` | `roster_members`, `roster_applications`, `scope_stats`, `group_candidates`; faster `find_new` (same arguments and results); the applications queue indexes get the id as a tie-break (`applications_queue_page`, `applications_group_queue_page` replace `applications_queue`, `applications_group_queue`: speed only). |
| 11 | `20261026130000_roster_page_key.sql` | `roster_members` lower-cases the page key itself (same arguments and results). |
| 9 | `20261027120000_card_answers.sql` | `search_profiles` + the column `answers` ("Shown on card" answers). Dropped and created: only the step 9 code calls it. |
| 7 | `20261027130000_group_admin_pick.sql` | `group_assignments` + the key `admin` per group (same arguments; the old build ignores the key). |

## 2. Pushed after steps 9–11 shipped

| Migration | What it does |
|---|---|
| `20261027140000_drop_live_compat.sql` | Dropped `profile_cards` and `group_directory` (the new code uses `search_profiles` and `find_new`). |
| `20261027150000_drop_old_rosters.sql` | Dropped `admin_roster` and `group_roster` (the new code uses `roster_members`, `roster_applications` and `scope_stats`). |

Committed with the step 9–11 code (4985c5b) and pushed 2026-10-27. Types regenerated; every test file passes. A build older than steps 9–11 can no longer list profiles, Find new, members or applications on this database.

## 3. Known before this file

Steps 5b–8 were pushed while the live site ran an older build. Sign-up on the live site needs the step 5b code (it sends the consents that `handle_new_user` now requires), so the live site can't sign anyone up until that code is deployed too.

## 4. Steps 12–15

The live site runs 09d272b (steps 0–11). Before each push: every function that build calls (`git grep "rpc('" 09d272b -- src`, 57 of them) was checked against the migration, `db push --dry-run` showed only the new file, and every test file ran with the migration in rolled-back `zz_` copies.

### Already in the database (nothing to run)

| Step | Migration | What it adds or changes |
|---|---|---|
| 12 | `20261028120000_calendar.sql` | `events` (no client grants), `calendar_month`, `save_event`, `delete_event`. |
| 13 | `20261029120000_albums.sql` | `albums`, `album_photos`, `album_grants`, `album_attempts` (no client grants) and their RPCs. `private.insert_photo` replaced with the same arguments and result (finds the uploaded files through Storage's index), which the old build's profile, application and chat photo saves keep using. |
| 14 | `20261030120000_ads.sql` | `ads` (no client grants), `members.ad_filter` (default `{}`, no column grant), `save_ad_filter`, `ad_filter`, `search_ads`, `member_ads`, `ad_view`, `save_ad`, `delete_ad`. |
| 15 | `20261031120000_launch.sql` | `rate_limits` (no client grants) with `rate_limit_take` and `rate_limit_refund` (service role only); `delete_my_account` and `private.folder_files`. |

All four only add. The old build never selects `*` from `members`, so the new column is invisible to it.

### Waiting in `supabase/deferred/` (to run after the deploy)

Nothing. Steps 12–15 removed nothing the old build uses, so there is nothing to run after the deploy, and `supabase/deferred/` doesn't exist.

After the deploy the old build's login keeps working on this database (it never calls the new functions); the rate limits and "Delete my account" start with the new code.
