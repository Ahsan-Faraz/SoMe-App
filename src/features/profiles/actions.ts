'use server'

import { refresh } from 'next/cache'
import { after } from 'next/server'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import type { FieldKind } from '@/features/fields/types'
import { isBool, isRecord, isUuid } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { FIELD_TEXT_MAX, LINK_COMMENT_MAX, LINKED_PROFILES_MAX, PLACE_MAX } from '@/lib/limits'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import type { FieldValue } from './fields'
import type { PhotoSlot, UploadedPhoto } from './photo'

// Profile writes. Each one is a single RPC that checks who is calling and validates every value
// (supabase/migrations/20261014120000_profile_sections.sql); the guards here only turn bad input into a
// friendly message first. refresh() sends the fresh profile back in the same response.

export type ProfileResult = { error: string } | undefined

// The person an answer or birth date is for: substatusId null + n 0 = the main section.
export type PersonRef = { substatusId: string | null; n: number }

export type ProfileInput = {
  lookingFor: string[] // Status ids
  countryId: string | null
  districtId: string | null
  place: string
  birthDates: (PersonRef & { date: string })[] // 'YYYY-MM-DD' or '' (none)
  values: (PersonRef & { fieldId: string; value: FieldValue })[]
}

const MAX_VALUES = 1000

// B: the edit form, in one transaction. The score is recomputed by the database.
export async function saveProfileAction(slug: string, input: ProfileInput): Promise<ProfileResult> {
  if (!isProfileInput(input)) return { error: t.profiles.invalid }
  const place = input.place.trim()
  if (place.length > PLACE_MAX) return { error: t.profiles.tooLong }

  const community = await getCommunity(slug)
  if (!community) return { error: t.profiles.notAllowed }
  const kinds = new Map((await getProfileSchema(community.id)).fields.map((field) => [field.id, field.kind]))

  const values: { field_id: string; substatus_id: string | null; n: number; value: Json }[] = []
  for (const item of input.values) {
    const kind = kinds.get(item.fieldId)
    if (!kind || kind === 'photo') return { error: t.profiles.invalid }
    const value = toDbValue(kind, item.value)
    if (value === undefined) return { error: t.profiles.invalid }
    values.push({ field_id: item.fieldId, substatus_id: item.substatusId, n: item.n, value })
  }

  const supabase = await createClient()
  return done(supabase, await supabase.rpc('save_profile', {
    p_community: community.id,
    p_profile: {
      looking_for: input.lookingFor,
      country_id: input.countryId,
      district_id: input.districtId,
      place,
      birth_dates: input.birthDates.map((item) => ({ substatus_id: item.substatusId, n: item.n, date: item.date })),
    },
    p_values: values,
  }))
}

// The member's first and only Status pick (D4); the community admin changes it afterwards.
export async function setStatusAction(slug: string, statusId: string): Promise<ProfileResult> {
  if (!isUuid(statusId)) return { error: t.profiles.invalid }
  const community = await getCommunity(slug)
  if (!community) return { error: t.profiles.notAllowed }
  const supabase = await createClient()
  return done(supabase, await supabase.rpc('save_profile', { p_community: community.id, p_profile: { status_id: statusId }, p_values: [] }))
}

// "Profile visible in search" (D22), saved as soon as it is toggled.
export async function setVisibleAction(slug: string, visible: boolean): Promise<ProfileResult> {
  if (!isBool(visible)) return { error: t.profiles.invalid }
  const community = await getCommunity(slug)
  if (!community) return { error: t.profiles.notAllowed }
  const supabase = await createClient()
  return done(supabase, await supabase.rpc('save_profile', { p_community: community.id, p_profile: { visible_in_search: visible }, p_values: [] }))
}

// A photo the phone has just uploaded (both files), put in its place. The one it replaces is deleted.
export async function addPhotoAction(slug: string, photo: UploadedPhoto, slot: PhotoSlot): Promise<ProfileResult> {
  if (!isUploadedPhoto(photo) || !isPhotoSlot(slot)) return { error: t.profiles.invalid }
  const community = await getCommunity(slug)
  if (!community) return { error: t.profiles.notAllowed }
  const supabase = await createClient()
  return done(supabase, await supabase.rpc('add_profile_photo', {
    p_community: community.id,
    p_photo: { path: photo.path, thumb_path: photo.thumbPath, width: photo.width, height: photo.height, taken_in_app: photo.takenInApp },
    p_slot: slot.kind === 'field' ? { kind: 'field', field_id: slot.fieldId, substatus_id: slot.substatusId, n: slot.n } : slot,
  }))
}

export async function removePhotoAction(slug: string, photoId: string): Promise<ProfileResult> {
  if (!isUuid(photoId)) return { error: t.profiles.invalid }
  const community = await getCommunity(slug)
  if (!community) return { error: t.profiles.notAllowed }
  const supabase = await createClient()
  return done(supabase, await supabase.rpc('remove_profile_photo', { p_community: community.id, p_photo: photoId }))
}

// A32: link to a member (on) or remove the link. At most 3; the database refuses a 4th.
export async function setLinkAction(slug: string, userId: string, on: boolean): Promise<ProfileResult> {
  if (!isUuid(userId) || !isBool(on)) return { error: t.profiles.invalid }
  const community = await getCommunity(slug)
  if (!community) return { error: t.profiles.notAllowed }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_profile_link', { p_community: community.id, p_linked: userId, p_on: on })
  if (error) return { error: error.code === '23514' ? t.linked.full(LINKED_PROFILES_MAX) : errorText(error.code) }
  refresh()
}

// A32: your short comment on one of your links ('' clears it), saved when the field is left.
export async function setLinkCommentAction(slug: string, userId: string, comment: string): Promise<ProfileResult> {
  if (!isUuid(userId) || typeof comment !== 'string') return { error: t.profiles.invalid }
  if (comment.trim().length > LINK_COMMENT_MAX) return { error: t.profiles.tooLong }
  const community = await getCommunity(slug)
  if (!community) return { error: t.profiles.notAllowed }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_profile_link_comment', { p_community: community.id, p_linked: userId, p_comment: comment.trim() })
  if (error) return { error: errorText(error.code) }
  refresh()
}

// A21: the community admin changes a member's Status. The database checks the admin role.
export async function setMemberStatusAction(slug: string, userId: string, statusId: string): Promise<ProfileResult> {
  if (!isUuid(userId) || !isUuid(statusId)) return { error: t.profiles.invalid }
  const community = await getCommunity(slug)
  if (!community) return { error: t.profiles.notAllowed }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_member_status', { p_community: community.id, p_user: userId, p_status: statusId })
  if (error) return { error: errorText(error.code) }
  refresh()
}

type Supabase = Awaited<ReturnType<typeof createClient>>

// The profile RPCs return {score, removed}: files of photos nothing uses any more. They are deleted
// from Storage after the response; a failed delete only leaves an unreachable file.
function done(supabase: Supabase, { data, error }: { data: Json; error: { code: string } | null }): ProfileResult {
  if (error) return { error: errorText(error.code) }
  const removed = isRecord(data) && Array.isArray(data.removed) ? data.removed.filter((path): path is string => typeof path === 'string') : []
  if (removed.length > 0) {
    after(async () => {
      await supabase.storage.from('profile').remove(removed)
    })
  }
  refresh()
}

// The form's value as save_profile takes it; null clears the answer, undefined = not valid.
function toDbValue(kind: Exclude<FieldKind, 'photo'>, value: FieldValue): Json | undefined {
  switch (kind) {
    case 'yes_no':
      return typeof value === 'boolean' ? value : undefined
    case 'pick_several':
      return Array.isArray(value) && value.every(isUuid) ? (value.length > 0 ? value : null) : undefined
    case 'pick_one':
      return typeof value === 'string' && (value === '' || isUuid(value)) ? value || null : undefined
    case 'number': {
      if (typeof value !== 'string') return undefined
      const text = value.trim().replace(',', '.')
      if (text === '') return null
      const number = Number(text)
      return Number.isFinite(number) ? number : undefined
    }
    case 'date':
      return typeof value === 'string' && (value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value || null : undefined
    default:
      return typeof value === 'string' && value.length <= FIELD_TEXT_MAX ? value.trim() || null : undefined
  }
}

function errorText(code: string): string {
  if (code === '42501') return t.profiles.notAllowed
  if (code === '22001') return t.profiles.tooLong
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return t.profiles.invalid
  return t.common.error
}

const DATE = /^(\d{4}-\d{2}-\d{2})?$/
const MAX_PEOPLE = 100
const isPersonRef = (value: Record<string, unknown>) =>
  (value.substatusId === null && value.n === 0) || (isUuid(value.substatusId) && Number.isInteger(value.n) && Number(value.n) >= 1 && Number(value.n) <= 20)
const isFieldValue = (value: unknown): value is FieldValue =>
  typeof value === 'string' || isBool(value) || (Array.isArray(value) && value.length <= 200 && value.every((item) => typeof item === 'string'))

function isProfileInput(value: unknown): value is ProfileInput {
  return (
    isRecord(value) &&
    Array.isArray(value.lookingFor) &&
    value.lookingFor.length <= 50 &&
    value.lookingFor.every(isUuid) &&
    (value.countryId === null || isUuid(value.countryId)) &&
    (value.districtId === null || isUuid(value.districtId)) &&
    typeof value.place === 'string' &&
    Array.isArray(value.birthDates) &&
    value.birthDates.length <= MAX_PEOPLE &&
    value.birthDates.every((item) => isRecord(item) && isPersonRef(item) && typeof item.date === 'string' && DATE.test(item.date)) &&
    Array.isArray(value.values) &&
    value.values.length <= MAX_VALUES &&
    value.values.every((item) => isRecord(item) && isUuid(item.fieldId) && isPersonRef(item) && isFieldValue(item.value))
  )
}

function isUploadedPhoto(value: unknown): value is UploadedPhoto {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    typeof value.thumbPath === 'string' &&
    Number.isInteger(value.width) &&
    Number.isInteger(value.height) &&
    isBool(value.takenInApp)
  )
}

function isPhotoSlot(value: unknown): value is PhotoSlot {
  if (!isRecord(value)) return false
  if (value.kind === 'profile') return true
  return value.kind === 'field' && isUuid(value.fieldId) && isPersonRef(value)
}
