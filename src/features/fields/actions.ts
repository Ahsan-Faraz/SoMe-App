'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { t } from '@/lib/i18n'
import { CHOICES_MAX, FIELD_LABEL_MAX, LIST_LABEL_MAX } from '@/lib/limits'
import { createClient } from '@/lib/supabase/server'
import { fieldsTag } from './queries'
import { CHOICE_LISTS, FIELD_KINDS, type ChoiceList, type FieldKind } from './types'

// Profile builder saves (community admin). The database decides who may write (RLS, column grants,
// and the RPCs' own admin check); the role check here only gives a friendly error first.

export type ChoiceInput = { id: string | null; label: string; active: boolean; people: 1 | 2 }

export type FieldInput = {
  id: string | null
  label: string
  kind: FieldKind
  required: boolean
  searchable: boolean
  onCard: boolean
  perPerson: boolean
  statuses: string[] | null
  maxLength: number | null
  active: boolean
  choices: ChoiceInput[]
}

export type BuilderResult = { error: string } | undefined

export async function saveFieldAction(slug: string, input: FieldInput): Promise<BuilderResult> {
  if (!isFieldInput(input)) return { error: t.builder.invalid }
  const label = input.label.trim()
  if (!label || label.length > FIELD_LABEL_MAX) return { error: t.builder.labelLength(FIELD_LABEL_MAX) }
  const pick = input.kind === 'pick_one' || input.kind === 'pick_several'
  const choices = pick ? input.choices : []
  if (choices.some((choice) => !choice.label.trim() || choice.label.trim().length > FIELD_LABEL_MAX)) return { error: t.builder.labelLength(FIELD_LABEL_MAX) }
  if (input.active && pick && !choices.some((choice) => choice.active)) return { error: t.builder.choicesMissing }

  const community = await adminCommunity(slug)
  if (!community) return { error: t.builder.notAllowed }

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_profile_field', {
    p_community: community.id,
    p_field: {
      id: input.id,
      label,
      kind: input.kind,
      required: input.required,
      searchable: input.searchable && input.kind !== 'photo',
      on_card: input.onCard,
      per_person: input.perPerson,
      for_statuses: input.statuses && input.statuses.length > 0 ? input.statuses : null,
      max_length: input.maxLength,
      active: input.active,
    },
    p_options: choices.map((choice) => ({ id: choice.id, label: choice.label.trim(), active: choice.active })),
  })
  if (error) return { error: errorText(error.code) }

  updateTag(fieldsTag(community.id))
  redirect(`/${slug}/admin/fields`)
}

export async function saveListAction(slug: string, list: ChoiceList, items: ChoiceInput[]): Promise<BuilderResult> {
  if (!CHOICE_LISTS.includes(list) || !Array.isArray(items) || items.length > CHOICES_MAX || !items.every(isChoiceInput)) return { error: t.builder.invalid }
  if (items.some((item) => !item.label.trim() || item.label.trim().length > LIST_LABEL_MAX)) return { error: t.builder.labelLength(LIST_LABEL_MAX) }

  const community = await adminCommunity(slug)
  if (!community) return { error: t.builder.notAllowed }

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_community_options', {
    p_community: community.id,
    p_list: list,
    p_items: items.map((item) => ({ id: item.id, label: item.label.trim(), active: item.active, people: list === 'status' ? item.people : 1 })),
  })
  if (error) return { error: errorText(error.code) }

  updateTag(fieldsTag(community.id))
  redirect(`/${slug}/admin/fields`)
}

// Field order, top to bottom. Saved on every move; the list updates on screen first.
export async function reorderFieldsAction(slug: string, ids: string[]): Promise<BuilderResult> {
  if (!Array.isArray(ids) || ids.length > 1000 || !ids.every(isUuid)) return { error: t.builder.invalid }

  const community = await adminCommunity(slug)
  if (!community) return { error: t.builder.notAllowed }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_profile_fields', { p_community: community.id, p_ids: ids })
  if (error) return { error: errorText(error.code) }

  updateTag(fieldsTag(community.id))
}

async function adminCommunity(slug: string) {
  const [community, viewer] = await Promise.all([getCommunity(slug), getViewer(slug)])
  return community && viewer?.role === 'admin' ? community : null
}

function errorText(code: string): string {
  if (code === '23505') return t.builder.duplicate
  if (code === '42501') return t.builder.notAllowed
  if (code === '23514' || code === '23503' || code === '22023' || code === '22P02') return t.builder.invalid
  return t.common.error
}

// Boundary guards: Server Action arguments come from the network, whatever the types say.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const isBool = (value: unknown): value is boolean => typeof value === 'boolean'
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function isChoiceInput(value: unknown): value is ChoiceInput {
  return (
    isRecord(value) &&
    (value.id === null || isUuid(value.id)) &&
    typeof value.label === 'string' &&
    isBool(value.active) &&
    (value.people === 1 || value.people === 2)
  )
}

function isFieldInput(value: unknown): value is FieldInput {
  return (
    isRecord(value) &&
    (value.id === null || isUuid(value.id)) &&
    typeof value.label === 'string' &&
    FIELD_KINDS.some((kind) => kind === value.kind) &&
    isBool(value.required) &&
    isBool(value.searchable) &&
    isBool(value.onCard) &&
    isBool(value.perPerson) &&
    isBool(value.active) &&
    (value.statuses === null || (Array.isArray(value.statuses) && value.statuses.length <= 50 && value.statuses.every(isUuid))) &&
    (value.maxLength === null || (Number.isInteger(value.maxLength) && Number(value.maxLength) >= 1 && Number(value.maxLength) <= 32000)) &&
    Array.isArray(value.choices) &&
    value.choices.length <= CHOICES_MAX &&
    value.choices.every(isChoiceInput)
  )
}
