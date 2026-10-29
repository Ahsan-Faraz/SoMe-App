import { isRecord } from '@/lib/guards'
import type { Json } from '@/lib/supabase/database.types'
import { emptyAdFilter, type AdFilter } from './types'

// The ad filter (D1) as save_ad_filter takes it and ad_filter() returns it. The form picks one
// district; the database keeps a list, like the profile filter.

const texts = ['text', 'place', 'minAge', 'maxAge', 'minScore', 'minStars', 'maxStars'] as const
const saved = { text: 'text', place: 'place', minAge: 'age_min', maxAge: 'age_max', minScore: 'score_min', minStars: 'stars_min', maxStars: 'stars_max' } as const
const numbers = new Set<string>(['minAge', 'maxAge', 'minScore', 'minStars', 'maxStars'])

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
const asText = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')
const number = (value: string) => (value === '' ? null : Number(value))

// The saved filter as the form edits it; anything malformed is left out.
export function fromSavedAdFilter(value: unknown): AdFilter {
  if (!isRecord(value)) return emptyAdFilter
  const filter: AdFilter = { ...emptyAdFilter, statuses: strings(value.statuses), lookingFor: strings(value.looking_for), district: strings(value.districts)[0] ?? '' }
  for (const name of texts) filter[name] = asText(value[saved[name]])
  return filter
}

// What save_ad_filter takes; it drops the empty parts.
export function toSavedAdFilter(filter: AdFilter): Json {
  const out: Record<string, Json> = { statuses: filter.statuses, looking_for: filter.lookingFor, districts: filter.district ? [filter.district] : [] }
  for (const name of texts) out[saved[name]] = numbers.has(name) ? number(filter[name]) : filter[name]
  return out
}

// For the badge on the filter icon: how many filters are set.
export function adFilterCount(filter: AdFilter) {
  return filter.statuses.length + filter.lookingFor.length + (filter.district ? 1 : 0) + texts.filter((name) => filter[name].trim() !== '').length
}

// The Ads tab starts over when the saved filter changes.
export const adFilterKey = (filter: AdFilter) => JSON.stringify(toSavedAdFilter(filter))
