# SoMe — agent guide

Wire-like chat plus community-scoped profiles. Not a payments app and not a dating marketplace. Read `docs/backend-design.md` (decisions and schema), `docs/User-Stories-and-Requirements.tex`, and `.cursor/rules/` when a task needs product detail.

The Next.js version in this repo differs from older training data. Before writing framework code, read the matching guide in `node_modules/next/dist/docs/`. The short block at the repo-root `AGENTS.md` is written by `next dev`; do not delete it.

## Invariants

- Scope every member, chat, search, and schema query by the current `community_id`.
- A group is a chat room inside one community. A group is not a community.
- Profile fields are definitions plus values, not hardcoded columns.
- A "Real" image (formerly "verified") is an in-app camera photo with a date. Gallery photos are allowed everywhere but are never Real. Do not claim Real cannot be faked.
- Private notes and ratings are visible only to the author, in the UI and in the API. Until the backend exists they live in `localStorage` on that device.
- Groups are created by the community admin or by members given group-create rights. One admin per group for now.

## Do not build

**Later:** payments, Swish, reputation, push, video, audio, co-admins, Google login, cross-community search, km distance. (Profile score is V1: stored and filterable; its rule is open question Q2.)

**Decided (Oct 2026, from Peter's answers, see `docs/backend-design.md` §2):** 3 bottom tabs (Chats / Profiles / Ads); path URLs (`/{community}`); separate account per community (one login per email, own username and profile per community); the Ads tab stays (not ads-as-posts); profile fields are built by the community admin, with Status and District as built-in lists.

**Undecided, ask, do not guess:** user levels 1–3. The open questions Q1–Q8 in `docs/backend-design.md` §13 are built with their listed defaults.

If two sources disagree, name the conflict. Do not pick a winner.

## How to change the code

1. Read the files the task touches. Map the screen id (A1, A4, G1, …) when the task is UI.
2. If the feature is Later or undecided, stop and say so.
3. One slice only. Do not bundle search, calendar, and ads into one change.
4. Reuse existing components and `lib/` helpers. No new package without a measured performance reason.
5. Ship indexes, pagination, and explicit column lists in the same change as the query.

Protected: `.env` and secrets, unscoped `select`, bypassing RLS, unrelated refactors.

## Performance

Targets for a mid-range phone on 4G: LCP under 2.5 s cold and under 1 s on repeat, INP under 200 ms, first-load JS for the chat list at or under 150 KB gzip, hot query p95 under 100 ms.

- Server Components for first paint. Client JS only for the composer, long-press sheet, camera, and sliders.
- The chat list ships no calendar, camera, album, or ads code. Load those screens with `import()`.
- Hot writes (send, react, mark-read) go browser to Supabase under RLS. Privileged work (admit, verify, album password) goes through the server.
- One round trip per screen. Never `await` in a loop.
- `src/proxy.ts` only refreshes the session. No database queries in it.
- System font stack. `next/image` for static assets. No new dependency.
- Lists: `community_id` (or chat membership), explicit columns, and a limit. No `select('*')`. No `count: 'exact'` on hot paths.
- `public/sw.js` has no fetch handler. Do not cache HTML, RSC payloads, API responses, or messages.

Database and Realtime detail is in `.cursor/rules/performance.mdc`.

## Where files go

- A URL goes in `src/app/`. The page stays thin.
- One domain’s code goes in `src/features/<domain>/`.
- Shared UI goes in `src/components/`.
- Clients, env, and auth helpers go in `src/lib/`.

Page pattern: a sync default export wraps an async content function in `<Suspense>` with the route skeleton. `cacheComponents` is on, so cookies, params, and database reads stay inside that Suspense boundary.

Check types with `npm run typecheck` on the files you touch.
