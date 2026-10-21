import 'server-only'
import { cache } from 'react'
import { getCommunity } from '@/features/communities/queries'
import { profilePhotoUrl } from '@/features/profiles/photo'
import { isRecord, isUuid } from '@/lib/guards'
import { createClient } from '@/lib/supabase/server'
import type { GroupAssignments, GroupCard, GroupForm, GroupInfo, InfoPost } from './types'

// Groups read through RPCs that check who is asking (supabase/migrations/20261021120000_groups.sql):
// settings for the group admin or the community admin, the info for its members, the card for
// approved members. Each returns null when the viewer may not see it.

type Row = Record<string, unknown>
const text = (row: Row, key: string) => (typeof row[key] === 'string' ? (row[key] as string) : '')
const flag = (row: Row, key: string) => row[key] === true

function infosOf(value: unknown): InfoPost[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (isRecord(item) && typeof item.n === 'number' ? [{ n: item.n, headline: text(item, 'headline'), body: text(item, 'body') }] : []))
    : []
}

async function rpcOf(slug: string, chatId: string): Promise<{ communityId: string; supabase: Awaited<ReturnType<typeof createClient>> } | null> {
  const community = await getCommunity(slug)
  if (!community || !isUuid(chatId)) return null
  return { communityId: community.id, supabase: await createClient() }
}

// A10 and the group's admin screens: the settings and Info 1–3. cache(): a page and the scope share it.
export const getGroupSettings = cache(async (slug: string, chatId: string): Promise<{ group: GroupForm; infos: InfoPost[] } | null> => {
  const ctx = await rpcOf(slug, chatId)
  if (!ctx) return null
  const { data, error } = await ctx.supabase.rpc('group_settings', { p_community: ctx.communityId, p_chat: chatId })
  if (error) throw error
  if (!isRecord(data)) return null
  const labels = Array.isArray(data.state_labels) ? data.state_labels : []
  return {
    group: {
      id: text(data, 'id'),
      name: text(data, 'name'),
      headline: text(data, 'headline'),
      applicationText: text(data, 'application_text'),
      stateLabels: [0, 1, 2].map((i) => (typeof labels[i] === 'string' ? (labels[i] as string) : '')),
      visibleInSearch: flag(data, 'visible_in_search'),
      applyImage: flag(data, 'require_app_image'),
      applyText: flag(data, 'require_app_text'),
      applyNames: flag(data, 'require_app_names'),
      calendar: flag(data, 'calendar'),
      history: flag(data, 'history'),
      memberList: flag(data, 'member_list'),
      editPosts: flag(data, 'allow_post_editing'),
      directJoin: flag(data, 'direct_join'),
      posting: flag(data, 'allow_posting'),
      commenting: flag(data, 'allow_commenting'),
      reactions: flag(data, 'allow_reactions'),
    },
    infos: infosOf(data.infos),
  }
})

// G3 and B2 in one call: name, headline, Info 1–3, and the member list when shown.
export const getGroupInfo = cache(async (slug: string, chatId: string): Promise<GroupInfo | null> => {
  const ctx = await rpcOf(slug, chatId)
  if (!ctx) return null
  const { data, error } = await ctx.supabase.rpc('group_info', { p_community: ctx.communityId, p_chat: chatId })
  if (error) throw error
  if (!isRecord(data)) return null
  const members = Array.isArray(data.members)
    ? data.members.flatMap((item) =>
        isRecord(item) && typeof item.user_id === 'string'
          ? [{ id: item.user_id, username: text(item, 'username'), icon: typeof item.icon === 'string' ? profilePhotoUrl(item.icon) : null, admin: item.admin === true }]
          : [],
      )
    : null
  return {
    id: text(data, 'id'),
    name: text(data, 'name'),
    headline: text(data, 'headline'),
    infos: infosOf(data.infos),
    members,
    memberCount: typeof data.member_count === 'number' ? data.member_count : null,
    member: flag(data, 'member'),
    admin: data.role === 'admin',
    manage: flag(data, 'manage'),
  }
})

// A24: the group as someone outside it sees it (to join or apply).
export async function getGroupCard(slug: string, chatId: string): Promise<GroupCard | null> {
  const ctx = await rpcOf(slug, chatId)
  if (!ctx) return null
  const { data, error } = await ctx.supabase.rpc('group_card', { p_community: ctx.communityId, p_chat: chatId })
  if (error) throw error
  if (!isRecord(data)) return null
  const requires = isRecord(data.requires) ? data.requires : {}
  return {
    id: text(data, 'id'),
    name: text(data, 'name'),
    headline: text(data, 'headline'),
    applicationText: text(data, 'application_text'),
    directJoin: flag(data, 'direct_join'),
    requires: { image: flag(requires, 'image'), text: flag(requires, 'text'), names: flag(requires, 'names') },
    member: flag(data, 'member'),
    applied: flag(data, 'applied'),
  }
}

// A2 "Find new group": visible groups the viewer is not in.
export async function listGroupDirectory(slug: string): Promise<{ id: string; name: string; headline: string }[]> {
  const community = await getCommunity(slug)
  if (!community) return []
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('group_directory', { p_community: community.id })
  if (error) throw error
  return data.map((row) => ({ id: row.chat_id, name: row.name, headline: row.headline ?? '' }))
}

// F1: the groups the viewer may add this member to, and (community admin) their group-create rights.
export async function listAssignments(slug: string, userId: string): Promise<GroupAssignments> {
  const community = await getCommunity(slug)
  if (!community || !isUuid(userId)) return { canCreateGroups: null, groups: [] }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('group_assignments', { p_community: community.id, p_user: userId })
  if (error) throw error
  if (!isRecord(data)) return { canCreateGroups: null, groups: [] }
  return {
    canCreateGroups: typeof data.can_create_groups === 'boolean' ? data.can_create_groups : null,
    groups: Array.isArray(data.groups)
      ? data.groups.flatMap((item) => (isRecord(item) && typeof item.id === 'string' ? [{ id: item.id, name: text(item, 'name'), member: item.member === true }] : []))
      : [],
  }
}
