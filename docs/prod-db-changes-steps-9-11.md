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

## 2. In the repo, push after the deploy

These two migrations are committed with the step 9–11 code but **not pushed**. Push them only once that code is **deployed and working** on the live site. Before that, the live site would call functions that no longer exist.

| Migration | What it does |
|---|---|
| `20261027140000_drop_live_compat.sql` | Drops `profile_cards` and `group_directory` (the new code uses `search_profiles` and `find_new`). |
| `20261027150000_drop_old_rosters.sql` | Drops `admin_roster` and `group_roster` (at most 2,000 rows, searched and counted on the phone; the new code uses `roster_members`, `roster_applications` and `scope_stats`). |

The tests and speed scripts no longer call the four functions (`04_applications` and `09_groups` use `roster_members` / `roster_applications`; `13_search` lost its two checks for the old build). Every test file passes both without the drops (today's database) and with them (checked 2026-10-27 in rolled-back copies).

**Any `db push` sends both**, so nothing else may be pushed until the deploy (step 12's first migration included).

### After the deploy

1. `npx supabase db push --dry-run` lists exactly these two (plus anything newer).
2. `npx supabase db push`, then `npm run test:db`.
3. `npm run db:types` (the four functions leave the generated types), `npm run typecheck`, commit.
4. Delete this section.

## 3. Known before this file

Steps 5b–8 were pushed while the live site ran an older build. Sign-up on the live site needs the step 5b code (it sends the consents that `handle_new_user` now requires), so the live site can't sign anyone up until that code is deployed too.
