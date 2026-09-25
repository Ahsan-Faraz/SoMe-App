# SoMe

Wire-like chat and community-scoped profiles. A community is a private place with its own members, groups, and profile fields. A group is a chat room inside one community.

The first community in this repo is a mock: **Biking Stockholm** at `/biking-stockholm`. Data is local mock data. Supabase is the planned backend and is not wired to these screens yet.

## Stack

Next.js 16.3.6 (App Router), React 19.3.0, TypeScript 7.0.2, Tailwind CSS 4.3.3. Node.js 22 or newer. No extra UI or state packages — see the allowlist in `.cursor/rules/project-structure.mdc`.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000/biking-stockholm](http://localhost:3000/biking-stockholm).

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm run audit` | `npm audit` |

## Demo login

On the login screen, the username picks the role. Any password works.

| Username | Role |
| --- | --- |
| `admin` | Community admin |
| `pending` | Waiting for approval |
| anything else | Member |

## Screens in this build

Community start, login, join, pending approval, chat list, join a chat, create and edit a group, group members, add users, chat thread, post menu, find profiles (with filters), a profile, group info, info posts, and private notes. Ads is a coming-soon screen. Calendar and leave group are still in-page notes, not their own pages.

Private notes and scores are stored in the browser only (`localStorage`), on the device of the person who wrote them.

## Layout

```
src/app/                  routes only
src/features/<domain>/    queries, components, types for one domain
src/components/           shared UI
src/lib/                  i18n and shared helpers
src/mocks/                mock data
public/                   images, icons, service worker
docs/                     requirements and agent notes
```

Routes live under `src/app/[community]/`. A page reads params, calls a query, and renders a feature component. Imports go `app → features → components, lib`.

## Scope

Payments, push notifications, video and audio, co-admins, Google login, and cross-community search are later. Do not add them in passing. Product rules and the V1 backlog are in `docs/User-Stories-and-Requirements.tex` and `.cursor/rules/`.

## Agent notes

`docs/AGENTS.md` is the working guide for coding agents. `docs/CLAUDE.md` points at it.

The `AGENTS.md` and `CLAUDE.md` files at the repo root are maintained by Next.js (`next dev` rewrites the root `AGENTS.md`). Leave that Next.js block in place.
