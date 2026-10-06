import { t } from '@/lib/i18n'

// Dynamic profile fields: each status (profile type) has its own set. Later this comes from the
// community's field settings table; the renderer only depends on FieldDef.
export type FieldDef =
  | { id: string; label: string; type: 'text' | 'textarea' | 'checkbox' | 'number' }
  | { id: string; label: string; type: 'select' | 'multiselect'; options: readonly string[] }

export type FieldValue = string | boolean | string[]

const bikeType = { id: 'bikeType', label: t.profiles.select, type: 'select', options: ['Gravel', 'Road', 'MTB'] } as const
const days = { id: 'days', label: t.profiles.multi, type: 'multiselect', options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } as const
const area = { id: 'area', label: t.profiles.area, type: 'textarea' } as const
const headline = { id: 'headline', label: t.profiles.headline, type: 'text' } as const

const single: FieldDef[] = [
  { id: 'about', label: t.profiles.text, type: 'textarea' },
  { id: 'bike', label: t.profiles.checkbox, type: 'checkbox' },
  bikeType,
  { id: 'years', label: t.profiles.number, type: 'number' },
  days,
  area,
  headline,
]

const couple: FieldDef[] = [
  { id: 'about', label: t.profiles.aboutUs, type: 'textarea' },
  { id: 'partnerAge', label: t.profiles.partnerAge, type: 'number' },
  { id: 'together', label: t.profiles.rideTogether, type: 'checkbox' },
  bikeType,
  days,
  area,
  headline,
]

export function fieldsFor(status: string): FieldDef[] {
  return status.startsWith('Couple') ? couple : single
}

// Mock answers until profile_field_values exists.
export function seedValues(about: string, headline: string): Record<string, FieldValue> {
  return { about, headline, bike: true, bikeType: 'Gravel', years: '4', days: ['Tue'], area: 'South of the city', partnerAge: '', together: true }
}

export function displayValue(value: FieldValue | undefined): string {
  if (Array.isArray(value)) return value.join(', ') || '—'
  if (typeof value === 'boolean') return value ? t.profiles.yes : '—'
  return value?.trim() || '—'
}
