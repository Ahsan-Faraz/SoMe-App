import { en } from './en'

// All UI text lives in one dictionary per language (en.ts now). Plan: docs/adr/0001-translations.md.

// The shape every language must fill: same keys and same function arguments as en.ts, any text.
// A missing or extra key in another language's file fails `npm run typecheck`.
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends readonly (infer U)[]
      ? readonly Widen<U>[]
      : { readonly [K in keyof T]: Widen<T[K]> }

export type Dictionary = Widen<typeof en>

export const locales = ['en'] as const
export type Locale = (typeof locales)[number]

// Until there is a language choice, everyone gets English. Later the locale comes from the
// member's setting (then the community's default language); add sv.ts typed as Dictionary.
export const locale: Locale = 'en'

const dictionaries: Record<Locale, Dictionary> = { en }

export const t: Dictionary = dictionaries[locale]

// <html lang>, and the locale for Intl date formats (en-GB: "6 Oct 2026", day before month).
export const htmlLang: Record<Locale, string> = { en: 'en' }
export const dateLocale: Record<Locale, string> = { en: 'en-GB' }
