import type { FieldDef } from '@/features/fields/types'
import { t } from '@/lib/i18n'

// Profile answers. The fields come from the community's profile builder (features/fields); the
// answers are drafts on this device until profile_values exists (step 3).
// Text, number and date are strings, yes/no is a boolean, pick one/several are choice ids.
export type FieldValue = string | boolean | string[]

// Couples answer per-person fields twice: person 1 under the field id, person 2 under `${id}:2`.
export const valueKey = (fieldId: string, person: 1 | 2): string => (person === 1 ? fieldId : `${fieldId}:2`)

// Mock answers until profile_values exists: only the mock profiles' about and headline texts.
export function seedValues(fields: readonly FieldDef[], about: string, headline: string): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {}
  for (const field of fields) {
    if (field.key === 'about' || field.key === 'about_us') values[field.id] = about
    if (field.key === 'headline') values[field.id] = headline
  }
  return values
}

export function displayValue(field: FieldDef, value: FieldValue | undefined): string {
  const choice = (id: string) => field.choices.find((item) => item.id === id)?.label ?? ''
  if (Array.isArray(value)) return value.map(choice).filter(Boolean).join(', ') || '—'
  if (typeof value === 'boolean') return value ? t.profiles.yes : '—'
  if (field.kind === 'pick_one') return (value && choice(value)) || '—'
  return value?.trim() || '—'
}
