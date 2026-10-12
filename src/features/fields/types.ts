// The profile builder (D1, D4): Status and District lists plus the fields each community defines.
// Mirrors supabase/migrations/20261011120000_profile_builder.sql.

export const FIELD_KINDS = ['short_text', 'long_text', 'yes_no', 'pick_one', 'pick_several', 'number', 'date', 'photo'] as const
export type FieldKind = (typeof FIELD_KINDS)[number]

export const CHOICE_LISTS = ['status', 'district'] as const
export type ChoiceList = (typeof CHOICE_LISTS)[number]

// A retired choice (active = false) stays, so profiles that have it keep it; it is not offered again.
export type Choice = { id: string; label: string; active: boolean }
export type StatusChoice = Choice & { people: 1 | 2 } // a couple is 2 people

export type FieldDef = {
  id: string
  key: string
  label: string
  kind: FieldKind
  required: boolean
  searchable: boolean
  onCard: boolean
  perPerson: boolean
  statuses: string[] | null // Status choice ids; null = every Status
  maxLength: number | null
  active: boolean
  choices: Choice[] // pick one / pick several only
}

// Everything is included, retired rows too: old answers still need their labels.
export type ProfileSchema = {
  statuses: StatusChoice[]
  districts: Choice[]
  fields: FieldDef[]
}
