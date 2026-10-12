import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { locale } from '@/lib/i18n'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { activeLabels } from './schema'
import { FIELD_KINDS, type FieldKind, type ProfileSchema } from './types'

// Bounds from the migration: at most 200 choices per list, positions 0–999.
const OPTIONS_LIMIT = 400
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
  const [options, fields] = await Promise.all([
    db
      .from('community_options')
      .select('id, list, label, people, active')
      .eq('community_id', communityId)
      .order('position')
      .order('id')
      .limit(OPTIONS_LIMIT),
    db
      .from('profile_fields')
      .select('id, key, label, kind, required, searchable, on_card, per_person, for_statuses, max_length, active, profile_field_options(id, label, active, position)')
      .eq('community_id', communityId)
      .order('position')
      .order('id')
      .order('position', { referencedTable: 'profile_field_options' })
      .limit(FIELDS_LIMIT),
  ])
  if (options.error) throw options.error
  if (fields.error) throw fields.error

  const choice = (row: { id: string; label: Json; active: boolean }) => ({ id: row.id, label: labelText(row.label), active: row.active })

  return {
    statuses: options.data.filter((row) => row.list === 'status').map((row) => ({ ...choice(row), people: row.people === 2 ? 2 : 1 })),
    districts: options.data.filter((row) => row.list === 'district').map(choice),
    fields: fields.data.map((row) => ({
      id: row.id,
      key: row.key,
      label: labelText(row.label),
      kind: toKind(row.kind),
      required: row.required,
      searchable: row.searchable,
      onCard: row.on_card,
      perPerson: row.per_person,
      statuses: row.for_statuses,
      maxLength: row.max_length,
      active: row.active,
      choices: row.profile_field_options.map(choice),
    })),
  }
}

// The active Status and District names, for pickers and filters that still work with names.
export async function getChoiceLabels(communityId: string): Promise<{ statuses: string[]; districts: string[] }> {
  const schema = await getProfileSchema(communityId)
  return { statuses: activeLabels(schema.statuses), districts: activeLabels(schema.districts) }
}

// {"en": "Bike type"} -> the label in the current language, else any language it has (ADR 0001).
function labelText(label: Json): string {
  if (!label || typeof label !== 'object' || Array.isArray(label)) return ''
  const own = label[locale]
  if (typeof own === 'string') return own
  return Object.values(label).find((value): value is string => typeof value === 'string') ?? ''
}

function toKind(kind: string): FieldKind {
  const known = FIELD_KINDS.find((item) => item === kind)
  if (!known) throw new Error(`Unknown profile field kind: ${kind}`)
  return known
}
