# SoMe — agent guide

Wire-like chat plus community-scoped profiles. Not a payments app and not a dating marketplace. Read `docs/User-Stories-and-Requirements.tex` and `.cursor/rules/` when a task needs product detail.

The Next.js version in this repo differs from older training data. Before writing framework code, read the matching guide in `node_modules/next/dist/docs/`. The short block at the repo-root `AGENTS.md` is written by `next dev`; do not delete it.

## Invariants

- Scope every member, chat, search, and schema query by the current `community_id`.
- A group is a chat room inside one community. A group is not a community.
- Profile fields are definitions plus values, not hardcoded columns.
- A verified image is an in-app camera photo with a date. Do not claim it cannot be faked.
- Private notes and ratings are visible only to the author, in the UI and in the API. Until the backend exists they live in `localStorage` on that device.
- V1 group create is community or group admin only.

## Do not build

**Later:** payments, Swish, reputation, profile score, push, video, audio, co-admins, Google login, cross-community search.

**Undecided — ask, do not guess:** 2 vs 3 bottom tabs, path vs subdomain, account scope, ads-as-posts vs the ads screens, the first community field list, user levels 1–3.

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
