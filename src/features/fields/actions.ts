'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { isBool, isRecord, isUuid } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { CHOICES_MAX, FIELD_LABEL_MAX, LIST_LABEL_MAX } from '@/lib/limits'
import { createClient } from '@/lib/supabase/server'
import { fieldsTag } from './queries'
import { BUILTINS, CHOICE_LISTS, FIELD_KINDS, LAYOUT_BUILTINS, type Builtins, type ChoiceList, type FieldKind, type LayoutItem } from './types'

// Profile builder saves (community admin). The database decides who may write (RLS, column grants,
// and the RPCs' own admin check); the role check here only gives a friendly error first.

export type ChoiceInput = { id: string | null; label: string; active: boolean }
// A Status's people: each substatus with how many of it (Couple MF = The Man × 1, The Woman × 1).
export type SlotInput = { substatusId: string; count: number }
export type ListItemInput = ChoiceInput & { slots?: SlotInput[] }

export type FieldInput = {
  id: string | null
  label: string
  kind: FieldKind
  required: boolean
  searchable: boolean
  onCard: boolean
  statuses: string[] | null
  substatuses: string[] | null
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
      for_substatuses: input.substatuses && input.substatuses.length > 0 ? input.substatuses : null,
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

// One list in its new order. Districts are saved per country (countryId); Status items carry their people.
export async function saveListAction(slug: string, list: ChoiceList, items: ListItemInput[], countryId: string | null = null): Promise<BuilderResult> {
  if (!CHOICE_LISTS.includes(list) || !Array.isArray(items) || items.length > CHOICES_MAX || !items.every(isListItem)) return { error: t.builder.invalid }
  if ((list === 'district') !== (countryId !== null) || (countryId !== null && !isUuid(countryId))) return { error: t.builder.invalid }
  if (items.some((item) => !item.label.trim() || item.label.trim().length > LIST_LABEL_MAX)) return { error: t.builder.labelLength(LIST_LABEL_MAX) }

  const community = await adminCommunity(slug)
  if (!community) return { error: t.builder.notAllowed }

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_community_options', {
    p_community: community.id,
    p_list: list,
    p_parent: countryId ?? undefined,
    p_items: items.map((item) => ({
      id: item.id,
      label: item.label.trim(),
      active: item.active,
      ...(list === 'status' && item.slots ? { slots: item.slots.map((slot) => ({ substatus_id: slot.substatusId, count: slot.count })) } : {}),
    })),
  })
  if (error) return { error: errorText(error.code) }

  updateTag(fieldsTag(community.id))
  redirect(`/${slug}/admin/fields`)
}

// The basic fields this community shows. Saved on every switch; the switch moves first.
export async function saveBuiltinsAction(slug: string, builtins: Builtins): Promise<BuilderResult> {
  if (!isRecord(builtins) || !BUILTINS.every((key) => isBool(builtins[key]))) return { error: t.builder.invalid }

  const community = await adminCommunity(slug)
  if (!community) return { error: t.builder.notAllowed }

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_profile_builtins', {
    p_community: community.id,
    p_settings: {
      show_looking_for: builtins.lookingFor,
      show_visibility: builtins.visibility,
      show_photo: builtins.photo,
      show_score: builtins.score,
      show_age: builtins.age,
      show_country: builtins.country,
      show_district: builtins.district,
      show_place: builtins.place,
      show_links: builtins.links,
    },
  })
  if (error) return { error: errorText(error.code) }

  updateTag(fieldsTag(community.id))
}

// The profile's order, top to bottom: fields and basic fields in one list. Saved on every move;
// the list updates on screen first.
export async function reorderLayoutAction(slug: string, items: LayoutItem[]): Promise<BuilderResult> {
  if (!Array.isArray(items) || items.length > 1000 || !items.every(isLayoutItem)) return { error: t.builder.invalid }

  const community = await adminCommunity(slug)
  if (!community) return { error: t.builder.notAllowed }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_profile_layout', {
    p_community: community.id,
    // profile_layout names basic fields in snake_case: lookingFor -> builtin:looking_for.
    p_items: items.map((item) => (item.type === 'field' ? item.id : `builtin:${item.key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`)),
  })
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

function isChoiceInput(value: unknown): value is ChoiceInput {
  return (
    isRecord(value) &&
    (value.id === null || isUuid(value.id)) &&
    typeof value.label === 'string' &&
    isBool(value.active)
  )
}

const SLOTS_MAX = 50
const SLOT_COUNT_MAX = 20

function isSlot(value: unknown): value is SlotInput {
  return isRecord(value) && isUuid(value.substatusId) && Number.isInteger(value.count) && Number(value.count) >= 1 && Number(value.count) <= SLOT_COUNT_MAX
}

function isListItem(value: unknown): value is ListItemInput {
  if (!isChoiceInput(value)) return false
  const { slots } = value as { slots?: unknown }
  return slots === undefined || (Array.isArray(slots) && slots.length <= SLOTS_MAX && slots.every(isSlot))
}

function isLayoutItem(value: unknown): value is LayoutItem {
  if (!isRecord(value)) return false
  return value.type === 'field' ? isUuid(value.id) : value.type === 'builtin' && LAYOUT_BUILTINS.some((key) => key === value.key)
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
    isBool(value.active) &&
    (value.statuses === null || (Array.isArray(value.statuses) && value.statuses.length <= 50 && value.statuses.every(isUuid))) &&
    (value.substatuses === null || (Array.isArray(value.substatuses) && value.substatuses.length <= 50 && value.substatuses.every(isUuid))) &&
    (value.maxLength === null || (Number.isInteger(value.maxLength) && Number(value.maxLength) >= 1 && Number(value.maxLength) <= 32000)) &&
    Array.isArray(value.choices) &&
    value.choices.length <= CHOICES_MAX &&
    value.choices.every(isChoiceInput)
  )
}
