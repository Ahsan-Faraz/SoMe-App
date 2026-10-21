'use server'

import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { getProfile } from '@/features/profiles/queries'
import { missingRequired } from '@/features/profiles/required'
import type { UploadedPhoto } from '@/features/profiles/photo'
import { sendEmail } from '@/lib/email'
import { isBool, isRecord, isUuid } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { LONG_TEXT_MAX, REAL_NAME_MAX } from '@/lib/limits'
import { deletePrivateFiles } from '@/lib/supabase/private-files'
import { createClient } from '@/lib/supabase/server'
import { REAL_NAMES, STATE_FIELDS } from './types'

// Community applications and admin records (step 4). Each action is one RPC that checks the caller
// (supabase/migrations/20261016120000_applications.sql); the guards here only give a friendly message
// first. refresh() sends the fresh screen back in the same response. Group scopes are step 7.

export type MembershipResult = { error: string } | undefined

export type ApplicationInput = { photo: UploadedPhoto | null; idPhoto: UploadedPhoto | null; message: string; realNames: string[] }

// A25: apply to the community, once. The images are already in the private bucket.
export async function submitApplicationAction(slug: string, input: ApplicationInput): Promise<MembershipResult> {
  if (!isApplicationInput(input)) return { error: t.apply.missing }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_application', {
    p_community: community.id,
    p_application: {
      ...(input.photo ? { photo: photoJson(input.photo) } : {}),
      ...(input.idPhoto ? { id_photo: photoJson(input.idPhoto) } : {}),
      message: input.message.trim(),
      real_name_1: input.realNames[0]?.trim() ?? '',
      real_name_2: input.realNames[1]?.trim() ?? '',
    },
  })
  if (error) {
    if (error.code === '23514') return { error: await missingText(slug, community.id) }
    if (error.code === '23505') return { error: t.apply.applied }
    if (error.code === '23502') return { error: t.apply.missing }
    return { error: t.common.error }
  }
  refresh()
}

// The refused application's message: the profile fields still to fill in, by name.
async function missingText(slug: string, communityId: string): Promise<string> {
  const viewer = await getViewer(slug)
  const [profile, schema] = await Promise.all([viewer ? getProfile(slug, viewer.userId) : null, getProfileSchema(communityId)])
  const missing = profile ? missingRequired(schema, profile) : []
  return missing.length ? t.apply.profileMissing(missing) : t.apply.profileFirst
}

// A24: apply to a group, once while open. The image is already in the private bucket.
export async function applyToGroupAction(slug: string, groupId: string, input: ApplicationInput): Promise<MembershipResult> {
  if (!isUuid(groupId) || !isApplicationInput(input)) return { error: t.apply.missing }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { error } = await supabase.rpc('apply_to_group', {
    p_community: community.id,
    p_chat: groupId,
    p_application: {
      ...(input.photo ? { photo: photoJson(input.photo) } : {}),
      message: input.message.trim(),
      real_name_1: input.realNames[0]?.trim() ?? '',
      real_name_2: input.realNames[1]?.trim() ?? '',
    },
  })
  if (error) {
    if (error.code === '23505') return { error: t.apply.applied }
    if (error.code === '23502') return { error: t.apply.missing }
    return { error: t.common.error }
  }
  refresh()
}

// A20/A21 and A22/A23: Approve (Q5: the only button for now; the database also takes 'later' and
// 'rejected'). The community's or a group's application: the database checks the right admin. The
// approval email (community only) goes out after the response; a failed email never undoes it.
export async function approveApplicationAction(slug: string, applicationId: string): Promise<MembershipResult> {
  if (!isUuid(applicationId)) return { error: t.common.error }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('decide_application', { p_application: applicationId, p_decision: 'approved' })
  if (error) return { error: error.code === '42501' ? t.builder.notAllowed : t.membership.decided }

  deletePrivateFiles(data)
  const email = isRecord(data) && typeof data.email === 'string' ? data.email : null
  const username = isRecord(data) && typeof data.username === 'string' ? data.username : ''
  if (email) {
    const origin = (await headers()).get('origin') ?? ''
    after(async () => {
      await sendEmail({
        to: email,
        fromName: community.name,
        subject: t.email.approvedSubject(community.name),
        text: t.email.approvedBody(username, community.name, `${origin}/${slug}/login`),
      })
    })
  }
  refresh()
}

export type RecordPatch = { realNames?: string[]; state?: string[]; notes?: string }

// A21/A31 (groupId null) or A22/A30: the community's or a group's record of a member, saved when a
// field is left.
export async function saveRecordAction(slug: string, groupId: string | null, userId: string, patch: RecordPatch): Promise<MembershipResult> {
  if (!isUuid(userId) || (groupId !== null && !isUuid(groupId)) || !isRecordPatch(patch)) return { error: t.membership.invalid }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const record: Record<string, string> = {}
  patch.realNames?.forEach((name, index) => (record[`real_name_${index + 1}`] = name.trim()))
  patch.state?.forEach((value, index) => (record[`state_${index + 1}`] = value.trim()))
  if (patch.notes !== undefined) record.notes = patch.notes.trim()

  const supabase = await createClient()
  const { error } = groupId
    ? await supabase.rpc('save_group_record', { p_community: community.id, p_chat: groupId, p_user: userId, p_record: record })
    : await supabase.rpc('save_admin_record', { p_community: community.id, p_user: userId, p_record: record })
  if (error) return { error: error.code === '42501' ? t.builder.notAllowed : t.membership.invalid }
  refresh()
}

// A31: remove a member from the community (they lose access; their data stays).
export async function removeMemberAction(slug: string, userId: string): Promise<MembershipResult> {
  if (!isUuid(userId)) return { error: t.common.error }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('remove_member', { p_community: community.id, p_user: userId })
  if (error) return { error: error.code === '42501' ? t.builder.notAllowed : t.common.error }
  deletePrivateFiles(data)
  refresh()
}

const photoJson = (photo: UploadedPhoto) => ({ path: photo.path, thumb_path: photo.thumbPath, width: photo.width, height: photo.height, taken_in_app: photo.takenInApp })

const isUploadedPhoto = (value: unknown): value is UploadedPhoto =>
  isRecord(value) &&
  typeof value.path === 'string' &&
  typeof value.thumbPath === 'string' &&
  Number.isInteger(value.width) &&
  Number.isInteger(value.height) &&
  isBool(value.takenInApp)

const WHOLE = /^-?\d{0,9}$/
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length <= max

function isApplicationInput(value: unknown): value is ApplicationInput {
  return (
    isRecord(value) &&
    (value.photo === null || isUploadedPhoto(value.photo)) &&
    (value.idPhoto === null || isUploadedPhoto(value.idPhoto)) &&
    isText(value.message, LONG_TEXT_MAX) &&
    Array.isArray(value.realNames) &&
    value.realNames.length <= REAL_NAMES &&
    value.realNames.every((name) => isText(name, REAL_NAME_MAX))
  )
}

function isRecordPatch(value: unknown): value is RecordPatch {
  return (
    isRecord(value) &&
    (value.realNames === undefined || (Array.isArray(value.realNames) && value.realNames.length <= REAL_NAMES && value.realNames.every((name) => isText(name, REAL_NAME_MAX)))) &&
    (value.state === undefined ||
      (Array.isArray(value.state) && value.state.length <= STATE_FIELDS && value.state.every((item) => typeof item === 'string' && WHOLE.test(item.trim())))) &&
    (value.notes === undefined || isText(value.notes, LONG_TEXT_MAX))
  )
}
