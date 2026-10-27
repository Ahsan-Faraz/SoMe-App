import type { FieldDef } from '@/features/fields/types'
import { isRecord } from '@/lib/guards'
import type { Json } from '@/lib/supabase/database.types'

// G1, saved on the account (members.search_filter) and applied by search_profiles. Choices are ids;
// number fields are strings while typed: '' = no limit. Reputation min comes later.
export type ProfileFilter = {
  text: string
  statuses: string[]
  lookingFor: string[]
  districts: string[]
  place: string
  minAge: string
  maxAge: string
  minScore: string
  minStars: string
  maxStars: string
  fields: Record<string, FieldFilter> // by field id: the searchable builder fields
}

// One searchable field's condition, by its kind: text, yes/no, any of the choices, or a range.
export type FieldFilter = { text?: string; yes?: boolean; options?: string[]; min?: string; max?: string; from?: string; to?: string }

export const emptyFilter: ProfileFilter = {
  text: '',
  statuses: [],
  lookingFor: [],
  districts: [],
  place: '',
  minAge: '',
  maxAge: '',
  minScore: '',
  minStars: '',
  maxStars: '',
  fields: {},
}

// The fields the filter offers: searchable, active, and not photos.
export const searchableFields = (fields: readonly FieldDef[]) => fields.filter((field) => field.searchable && field.active && field.kind !== 'photo')

const lists = ['statuses', 'lookingFor', 'districts'] as const
const texts = ['text', 'place', 'minAge', 'maxAge', 'minScore', 'minStars', 'maxStars'] as const
// Their keys in the saved filter (save_search_filter).
const saved = {
  text: 'text',
  statuses: 'statuses',
  lookingFor: 'looking_for',
  districts: 'districts',
  place: 'place',
  minAge: 'age_min',
  maxAge: 'age_max',
  minScore: 'score_min',
  minStars: 'stars_min',
  maxStars: 'stars_max',
} as const
const numbers = new Set<string>(['minAge', 'maxAge', 'minScore', 'minStars', 'maxStars'])

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
const asText = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')
const number = (value: string | undefined) => (value === undefined || value === '' ? null : Number(value))

// The saved filter as the form edits it; anything malformed is left out.
export function fromSaved(value: unknown): ProfileFilter {
  if (!isRecord(value)) return emptyFilter
  const filter: ProfileFilter = { ...emptyFilter, fields: {} }
  for (const name of lists) filter[name] = strings(value[saved[name]])
  for (const name of texts) filter[name] = asText(value[saved[name]])
  if (isRecord(value.fields)) {
    for (const [id, cond] of Object.entries(value.fields)) {
      if (!isRecord(cond)) continue
      filter.fields[id] = {
        ...(typeof cond.text === 'string' ? { text: cond.text } : {}),
        ...(typeof cond.yes === 'boolean' ? { yes: cond.yes } : {}),
        ...(Array.isArray(cond.options) ? { options: strings(cond.options) } : {}),
        ...(typeof cond.min === 'number' ? { min: String(cond.min) } : {}),
        ...(typeof cond.max === 'number' ? { max: String(cond.max) } : {}),
        ...(typeof cond.from === 'string' ? { from: cond.from } : {}),
        ...(typeof cond.to === 'string' ? { to: cond.to } : {}),
      }
    }
  }
  return filter
}

// What save_search_filter takes; it drops the empty parts.
export function toSaved(filter: ProfileFilter): Json {
  const out: Record<string, Json> = {}
  for (const name of lists) out[saved[name]] = filter[name]
  for (const name of texts) out[saved[name]] = numbers.has(name) ? number(filter[name]) : filter[name]
  const fields: Record<string, Json> = {}
  for (const [id, cond] of Object.entries(filter.fields)) {
    fields[id] = {
      text: cond.text ?? null,
      yes: cond.yes ?? null,
      options: cond.options ?? null,
      min: number(cond.min),
      max: number(cond.max),
      from: cond.from || null,
      to: cond.to || null,
    }
  }
  out.fields = fields
  return out
}

// For the badge on the filter icon: how many filters are set.
export function filterCount(filter: ProfileFilter) {
  const fields = Object.values(filter.fields).filter(
    (cond) => Boolean(cond.text?.trim()) || cond.yes !== undefined || Boolean(cond.options?.length) || Boolean(cond.min || cond.max || cond.from || cond.to),
  ).length
  return lists.reduce((sum, name) => sum + filter[name].length, 0) + texts.filter((name) => filter[name].trim() !== '').length + fields
}

// Lists and swipe start over when the saved filter changes.
export const filterKey = (filter: ProfileFilter) => JSON.stringify(toSaved(filter))
