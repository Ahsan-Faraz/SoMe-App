// The profile builder (D1, D4): the community's lists, the basic fields it shows, and the fields it
// defines. Mirrors supabase/migrations/20261011120000_profile_builder.sql and 20261014120000_profile_sections.sql.

export const FIELD_KINDS = ['short_text', 'long_text', 'yes_no', 'pick_one', 'pick_several', 'number', 'date', 'photo'] as const
export type FieldKind = (typeof FIELD_KINDS)[number]

// Status: decides the fields. Substatus: the people a Status has (The Man, The Woman, ...).
// Country, then District within a country (a City list per district comes later).
export const CHOICE_LISTS = ['status', 'substatus', 'country', 'district'] as const
export type ChoiceList = (typeof CHOICE_LISTS)[number]

// A retired choice (active = false) stays, so profiles that have it keep it; it is not offered again.
export type Choice = { id: string; label: string; active: boolean }
// The people of a Status, in order: Couple MF = [The Man × 1, The Woman × 1]. None = one person.
export type StatusSlot = { substatusId: string; count: number }
export type StatusChoice = Choice & { slots: StatusSlot[] }
export type DistrictChoice = Choice & { countryId: string }

export type FieldDef = {
  id: string
  key: string
  label: string
  kind: FieldKind
  required: boolean
  searchable: boolean
  onCard: boolean
  statuses: string[] | null // Status choice ids; null = every Status
  substatuses: string[] | null // shown in the section of each person with one of these; null = main section
  maxLength: number | null
  active: boolean
  choices: Choice[] // pick one / pick several only
}

// The basic fields this community shows (Status is always on: it decides the fields).
export const BUILTINS = ['lookingFor', 'visibility', 'photo', 'score', 'age', 'country', 'district', 'place', 'links'] as const
export type Builtin = (typeof BUILTINS)[number]
export type Builtins = Record<Builtin, boolean>

// Basic fields with a place in the profile's order, among the fields. Status and "visible in search"
// stay at the top. Age goes in each person's section.
export const LAYOUT_BUILTINS = ['photo', 'lookingFor', 'age', 'country', 'district', 'place', 'score', 'links'] as const satisfies readonly Builtin[]
export type LayoutBuiltin = (typeof LAYOUT_BUILTINS)[number]
export type LayoutItem = { type: 'field'; id: string } | { type: 'builtin'; key: LayoutBuiltin }

// Everything is included, retired rows too: old answers still need their labels.
// layout: the profile's order, top to bottom (fields and basic fields, shown or not).
export type ProfileSchema = {
  statuses: StatusChoice[]
  substatuses: Choice[]
  countries: Choice[]
  districts: DistrictChoice[]
  fields: FieldDef[]
  builtins: Builtins
  layout: LayoutItem[]
}
