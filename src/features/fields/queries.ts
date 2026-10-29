import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { locale } from '@/lib/i18n'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { FIELD_KINDS, LAYOUT_BUILTINS, type FieldKind, type LayoutBuiltin, type ProfileSchema } from './types'

// Bounds from the migrations: at most 200 choices per list (4 lists), positions 0–999.
const OPTIONS_LIMIT = 1000
const SLOTS_LIMIT = 2000
const FIELDS_LIMIT = 1000

// Saving anything in the builder calls updateTag(fieldsTag(id)) so the next read is fresh.
export const fieldsTag = (communityId: string) => `fields:${communityId}`

// Read on almost every profile screen and changed rarely, so it is cached per community and shared
// by all its members (scaling.mdc: field defs may be stale until saved). The cache can't read
// cookies, so it reads with the service role: callers must have checked membership (getViewer)
// first, and every query here is filtered by community_id.
export async function getProfileSchema(communityId: string): Promise<ProfileSchema> {
  'use cache'
  cacheLife('days')
  cacheTag(fieldsTag(communityId))

  const db = createAdminClient()
  const [options, slots, fields, community, layout] = await Promise.all([
    db
      .from('community_options')
      .select('id, list, label, parent_id, active')
      .eq('community_id', communityId)
      .order('position')
      .order('id')
      .limit(OPTIONS_LIMIT),
    db.from('status_slots').select('status_id, substatus_id, count').eq('community_id', communityId).order('position').limit(SLOTS_LIMIT),
    db
      .from('profile_fields')
      .select('id, key, label, kind, required, searchable, on_card, for_statuses, for_substatuses, max_length, active, position, profile_field_options(id, label, active, position)')
      .eq('community_id', communityId)
      .order('position')
      .order('id')
      .order('position', { referencedTable: 'profile_field_options' })
      .limit(FIELDS_LIMIT),
    db
      .from('communities')
      .select('show_looking_for, show_visibility, show_photo, show_score, show_age, show_country, show_district, show_place, show_links')
      .eq('id', communityId)
      .single(),
    db.from('profile_layout').select('builtin, position').eq('community_id', communityId).limit(LAYOUT_BUILTINS.length),
  ])
  if (options.error) throw options.error
  if (slots.error) throw slots.error
  if (fields.error) throw fields.error
  if (community.error) throw community.error
  if (layout.error) throw layout.error

  const choice = (row: { id: string; label: Json; active: boolean }) => ({ id: row.id, label: labelText(row.label), active: row.active })
  const of = (list: string) => options.data.filter((row) => row.list === list)
  const show = community.data

  return {
    statuses: of('status').map((row) => ({
      ...choice(row),
      slots: slots.data.filter((slot) => slot.status_id === row.id).map((slot) => ({ substatusId: slot.substatus_id, count: slot.count })),
    })),
    substatuses: of('substatus').map(choice),
    countries: of('country').map(choice),
    districts: of('district').map((row) => ({ ...choice(row), countryId: row.parent_id ?? '' })),
    fields: fields.data.map((row) => ({
      id: row.id,
      key: row.key,
      label: labelText(row.label),
      kind: toKind(row.kind),
      required: row.required,
      searchable: row.searchable,
      onCard: row.on_card,
      statuses: row.for_statuses,
      substatuses: row.for_substatuses,
      maxLength: row.max_length,
      active: row.active,
      choices: row.profile_field_options.map(choice),
    })),
    builtins: {
      lookingFor: show.show_looking_for,
      visibility: show.show_visibility,
      photo: show.show_photo,
      score: show.show_score,
      age: show.show_age,
      country: show.show_country,
      district: show.show_district,
      place: show.show_place,
      links: show.show_links,
    },
    layout: [
      ...fields.data.map((row) => ({ item: { type: 'field' as const, id: row.id }, position: row.position, first: 1 })),
      ...layout.data.flatMap((row) => {
        const key = toLayoutBuiltin(row.builtin)
        return key ? [{ item: { type: 'builtin' as const, key }, position: row.position, first: 0 }] : []
      }),
    ]
      // On a tie the basic field comes first.
      .sort((a, b) => a.position - b.position || a.first - b.first)
      .map(({ item }) => item),
  }
}

// {"en": "Bike type"} -> the label in the current language, else any language it has (ADR 0001).
function labelText(label: Json): string {
  if (!label || typeof label !== 'object' || Array.isArray(label)) return ''
  const own = label[locale]
  if (typeof own === 'string') return own
  return Object.values(label).find((value): value is string => typeof value === 'string') ?? ''
}

// profile_layout.builtin is snake_case: looking_for -> lookingFor.
function toLayoutBuiltin(name: string): LayoutBuiltin | undefined {
  const camel = name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
  return LAYOUT_BUILTINS.find((key) => key === camel)
}

function toKind(kind: string): FieldKind {
  const known = FIELD_KINDS.find((item) => item === kind)
  if (!known) throw new Error(`Unknown profile field kind: ${kind}`)
  return known
}
