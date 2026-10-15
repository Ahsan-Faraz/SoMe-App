import type { FieldDef } from '@/features/fields/types'
import { t } from '@/lib/i18n'

// Profile answers, as the edit form and the profile show them. Text, number and date are strings,
// yes/no is a boolean, pick one is a choice id, pick several is a list of choice ids.
// Photo answers are kept apart (Profile.photoValues): they are saved as soon as they are taken.
export type FieldValue = string | boolean | string[]

// An answer's key: the field alone in the main section, or the field for one person (Person.key).
export const valueKey = (fieldId: string, person: string): string => (person ? `${fieldId}@${person}` : fieldId)

export function displayValue(field: FieldDef, value: FieldValue | undefined): string {
  const choice = (id: string) => field.choices.find((item) => item.id === id)?.label ?? ''
  if (Array.isArray(value)) return value.map(choice).filter(Boolean).join(', ') || '—'
  if (typeof value === 'boolean') return value ? t.profiles.yes : t.profiles.no
  if (field.kind === 'pick_one') return (value && choice(value)) || '—'
  return value?.trim() || '—'
}
