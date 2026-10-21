'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCommunity } from '@/features/communities/queries'
import { isBool, isRecord, isUuid } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { GROUP_HEADLINE_MAX, HEADLINE_MAX, FIELD_TEXT_MAX, LONG_TEXT_MAX, NAME_MAX } from '@/lib/limits'
import { deletePrivateFiles } from '@/lib/supabase/private-files'
import { createClient } from '@/lib/supabase/server'
import type { GroupForm } from './types'

// Group writes. Each is one RPC that checks the caller (supabase/migrations/20261021120000_groups.sql):
// creating needs the community admin or group-create rights; the rest needs the group admin or the
// community admin. The guards here only turn bad input into a friendly message first.

export type GroupResult = { error: string } | undefined

const errorText = (code: string) => (code === '42501' ? t.groups.notAllowed : code === '23502' ? t.groups.nameMissing : t.common.error)

async function communityId(slug: string): Promise<string | null> {
  return (await getCommunity(slug))?.id ?? null
}

// A10 "Save": a new group (groupId null) or an edit. Then the group's chat (new) or its info (edit).
export async function saveGroupAction(slug: string, groupId: string | null, group: GroupForm, infos: string[]): Promise<GroupResult> {
  if ((groupId !== null && !isUuid(groupId)) || !isGroupForm(group) || !isInfos(infos)) return { error: t.groups.invalid }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_group', {
    p_community: community,
    // null = a new group (the generated types can't say a uuid argument may be null)
    p_chat: groupId as string,
    p_group: {
      name: group.name.trim(),
      headline: group.headline.trim(),
      application_text: group.applicationText.trim(),
      history: group.history,
      member_list: group.memberList,
      allow_posting: group.posting,
      allow_commenting: group.commenting,
      allow_reactions: group.reactions,
      allow_post_editing: group.editPosts,
      direct_join: group.directJoin,
      calendar: group.calendar,
      visible_in_search: group.visibleInSearch,
      require_app_image: group.applyImage,
      require_app_text: group.applyText,
      require_app_names: group.applyNames,
      state_labels: group.stateLabels.map((label) => label.trim()),
      infos: [0, 1, 2].map((i) => ({ headline: (infos[i * 2] ?? '').trim(), body: (infos[i * 2 + 1] ?? '').trim() })),
    },
  })
  if (error || !data) return { error: errorText(error?.code ?? '') }
  redirect(groupId ? `/${slug}/chats/${data}/info` : `/${slug}/chats/${data}`)
}

// A10 "Delete group".
export async function deleteGroupAction(slug: string, groupId: string): Promise<GroupResult> {
  if (!isUuid(groupId)) return { error: t.common.error }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_group', { p_community: community, p_chat: groupId })
  if (error) return { error: errorText(error.code) }
  deletePrivateFiles(data)
  redirect(`/${slug}/chats`)
}

// A2/A24 "Join" a group that allows direct join; then its chat.
export async function joinGroupAction(slug: string, groupId: string): Promise<GroupResult> {
  if (!isUuid(groupId)) return { error: t.common.error }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('join_group', { p_community: community, p_chat: groupId })
  if (error) return { error: errorText(error.code) }
  redirect(`/${slug}/chats/${groupId}`)
}

// A30 "+" and F1: add a member to a group (on) or take them out.
export async function setGroupMemberAction(slug: string, groupId: string, userId: string, on: boolean): Promise<GroupResult> {
  if (!isUuid(groupId) || !isUuid(userId) || !isBool(on)) return { error: t.common.error }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_group_member', { p_community: community, p_chat: groupId, p_user: userId, p_on: on })
  if (error) return { error: errorText(error.code) }
  deletePrivateFiles(data)
  refresh()
}

// F1 "Group create/admin rights" (community admin).
export async function setGroupRightsAction(slug: string, userId: string, on: boolean): Promise<GroupResult> {
  if (!isUuid(userId) || !isBool(on)) return { error: t.common.error }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_group_rights', { p_community: community, p_user: userId, p_on: on })
  if (error) return { error: errorText(error.code) }
  refresh()
}

const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length <= max

function isGroupForm(value: unknown): value is GroupForm {
  if (!isRecord(value)) return false
  const flags = ['visibleInSearch', 'applyImage', 'applyText', 'applyNames', 'calendar', 'history', 'memberList', 'editPosts', 'directJoin', 'posting', 'commenting', 'reactions']
  return (
    isText(value.name, NAME_MAX) &&
    isText(value.headline, GROUP_HEADLINE_MAX) &&
    isText(value.applicationText, LONG_TEXT_MAX) &&
    Array.isArray(value.stateLabels) &&
    value.stateLabels.length <= 3 &&
    value.stateLabels.every((label) => isText(label, 40)) &&
    flags.every((key) => isBool(value[key]))
  )
}

const isInfos = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 6 && value.every((item, i) => isText(item, i % 2 === 0 ? HEADLINE_MAX : FIELD_TEXT_MAX))
