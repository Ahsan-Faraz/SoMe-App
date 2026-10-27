import { personKey } from '@/features/fields/schema'
import type { FieldKind, ProfileSchema } from '@/features/fields/types'
import { isRecord } from '@/lib/guards'
import { t } from '@/lib/i18n'
import type { Database, Json } from '@/lib/supabase/database.types'
import { valueKey, type FieldValue } from './fields'
import type { ProfileFilter } from './filter'
import { profilePhotoUrl, toProfilePhoto, type PhotoRow } from './photo'
import type { CardAnswer, ProfileCard, ProfilePhoto } from './types'

// Used by the server for the first page and by the phone for the next ones (keyset paging), so the
// cards are built the same way on both sides.

// One page of the Profiles list and swipe (A5, A27).
export const CARDS_PAGE = 30

type CardRow = Database['public']['Functions']['search_profiles']['Returns'][number]

// The names of the ids a card carries (statuses, countries, districts), from the cached builder.
export type CardLabels = Record<string, string>

// A5 and A27 as the server starts them: the first page through the saved filter, and that filter.
export type ProfileSearch = { communityId: string; cards: ProfileCard[]; filter: ProfileFilter; labels: CardLabels }

// Also the fields shown on the cards ("Shown on card") and their choices.
export function cardLabels(schema: ProfileSchema): CardLabels {
  const named = (item: { id: string; label: string }): [string, string] => [item.id, item.label]
  return Object.fromEntries([
    ...[...schema.statuses, ...schema.countries, ...schema.districts].map(named),
    ...schema.fields.filter((field) => field.onCard).flatMap((field) => [named(field), ...field.choices.map(named)]),
  ])
}

const label = (labels: CardLabels, id: string | null) => (id ? (labels[id] ?? '') : '')

// The "Shown on card" answers as search_profiles gives them, in the profile order: {f: field, k: kind,
// v: values} (choice ids, yes/no as booleans, the rest as text). Each person's answer, joined.
function cardAnswers(json: Json | null, labels: CardLabels): CardAnswer[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((item) => {
    const name = isRecord(item) && typeof item.f === 'string' ? labels[item.f] : undefined
    if (!name || !isRecord(item) || !Array.isArray(item.v)) return []
    const choices = item.k === 'pick_one' || item.k === 'pick_several'
    const values = item.v.map((value) =>
      typeof value === 'boolean' ? (value ? t.profiles.yes : t.profiles.no) : typeof value === 'string' ? (choices ? label(labels, value) : value) : '',
    )
    const text = values.filter(Boolean).join(', ')
    return text ? [{ label: name, text }] : []
  })
}

export function toCard(row: CardRow, labels: CardLabels): ProfileCard {
  return {
    id: row.user_id,
    username: row.username,
    statusId: row.status_id ?? null,
    status: label(labels, row.status_id),
    ages: row.ages ?? [],
    country: label(labels, row.country_id),
    district: label(labels, row.district_id),
    place: row.place ?? '',
    score: row.score,
    stars: row.stars ?? 0,
    lookingFor: (row.looking_for ?? []).map((id) => label(labels, id)).filter(Boolean),
    photo: row.photo_thumb ? { src: profilePhotoUrl(row.photo_thumb), verified: Boolean(row.photo_taken_in_app), date: '' } : null,
    answers: cardAnswers(row.answers, labels),
  }
}

// Where the next page starts: after the last card (score, user).
export function nextPage(cards: readonly ProfileCard[]) {
  const last = cards.at(-1)
  return last ? { p_after_score: last.score, p_after_user: last.id } : {}
}

// A profile's answers as public.profile() returns them, keyed by valueKey(field, person).
type Person = { substatus_id: string | null; n: number }
export type AnswerRows = {
  values: (Person & { field_id: string; text: string | null; num: number | null; bool: boolean | null; date: string | null; photo: PhotoRow | null })[]
  choices: (Person & { field_id: string; option_ids: string[] })[]
}

export function toAnswers(rows: AnswerRows, kinds: ReadonlyMap<string, FieldKind>) {
  const keyOf = (item: Person & { field_id: string }) => valueKey(item.field_id, personKey(item.substatus_id, item.n))
  const values: Record<string, FieldValue> = {}
  const photoValues: Record<string, ProfilePhoto> = {}
  for (const value of rows.values) {
    const key = keyOf(value)
    if (value.photo) photoValues[key] = toProfilePhoto(value.photo)
    else if (value.text !== null) values[key] = value.text
    else if (value.num !== null) values[key] = String(value.num)
    else if (value.bool !== null) values[key] = value.bool
    else if (value.date !== null) values[key] = value.date
  }
  for (const choice of rows.choices) {
    values[keyOf(choice)] = kinds.get(choice.field_id) === 'pick_one' ? (choice.option_ids[0] ?? '') : choice.option_ids
  }
  return { values, photoValues }
}
