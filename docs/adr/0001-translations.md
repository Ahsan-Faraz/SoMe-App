# 0001 — Translations and language choice

Status: accepted (groundwork done Oct 2026; the language switch itself is not built yet)

## Context

The client will translate the whole site later (Swedish first) and wants a language choice. The app
must not need a rewrite for that.

## Decision

**UI text (buttons, labels, messages)** lives in one typed dictionary per language in
`src/lib/i18n/` (`en.ts` today). Components never hard-code text; they read `t.<area>.<key>`.
Text with values in it is a function (`t.profiles.scoreMin(100)`), so each language can order the words itself.

- `Dictionary` (in `src/lib/i18n/index.ts`) is the shape of `en.ts` with any text. A new language is
  `sv.ts` typed as `Dictionary`, added to `locales` and `dictionaries`. A missing key fails `npm run typecheck`.
- Dates use `Intl.DateTimeFormat(dateLocale[locale])`; `<html lang>` uses `htmlLang[locale]`. No hard-coded `'en-GB'`.
- No i18n library: the typed dictionary covers it without new JavaScript.
- `en.ts` is sent to the browser on every screen, so it holds short UI text only. Long text read by one
  server-rendered page (the privacy terms) lives in its own server-only file per language (`privacy.en.ts`).

**Community content** (profile field labels and choices, Status and District lists, group info posts,
application text) is data, not UI text. When translation starts, store it per language in the
database (e.g. a `labels jsonb` column `{ "en": …, "sv": … }`) and fall back to the community's default language.
What members write (messages, profiles, ads) is not translated.

**Choosing the language:** the member's setting (saved on `members`) → else the community's default
language → else the browser's `Accept-Language`. The URL stays `/{community}/…` with no language
part: the installed PWA keeps one start URL, and every page link keeps working.

## What changes when the switch is built

`t` is chosen once per process today (`locale` in `src/lib/i18n/index.ts`). With more than one
language it must be chosen per request: server components call `getT()` (reads the locale cookie set
from the member's setting), client components call `useT()` (a context set by the root layout).
Every string is already behind `t.`, so this is a find-and-replace, not a redesign.

## Consequences

- Every new screen adds its text to `en.ts`, never inline.
- Status values (Man, Woman, Couple MF, …) are stored values today and shown as-is. When the lists
  come from `community_options`, show their per-language label and keep the stored value stable.
