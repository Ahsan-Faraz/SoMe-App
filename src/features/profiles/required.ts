import { profileLayout, type Person } from '@/features/fields/schema'
import type { ProfileSchema } from '@/features/fields/types'
import { t } from '@/lib/i18n'
import { valueKey } from './fields'
import type { Profile } from './types'

// What is still missing before this profile can apply (A25): the Status, then every required field
// of the Status that has no answer, for each person it is asked of ("About us (The Man)").
// The same rule as private.required_filled (supabase/migrations/20261016120000_applications.sql),
// which has the last word when applying.
export function missingRequired(
  schema: Pick<ProfileSchema, 'layout' | 'fields' | 'builtins' | 'substatuses' | 'statuses'>,
  profile: Pick<Profile, 'statusId' | 'values' | 'photoValues'>,
): string[] {
  const status = schema.statuses.find((item) => item.id === profile.statusId)
  if (!status) return [t.profiles.status]
  const layout = profileLayout(schema, status)
  const sections: { person: Person | null; slots: typeof layout.main }[] = [{ person: null, slots: layout.main }, ...layout.sections]
  return sections.flatMap(({ person, slots }) =>
    slots.flatMap((slot) => {
      if (slot.type !== 'field' || !slot.field.required) return []
      const key = valueKey(slot.field.id, person?.key ?? '')
      const value = profile.values[key]
      const filled = slot.field.kind === 'photo' ? key in profile.photoValues : Array.isArray(value) ? value.length > 0 : typeof value === 'boolean' || Boolean(value?.trim())
      return filled ? [] : [person?.label ? `${slot.field.label} (${person.label})` : slot.field.label]
    }),
  )
}
