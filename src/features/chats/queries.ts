import 'server-only'
import { cache } from 'react'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { profilePhotoUrl } from '@/features/profiles/photo'
import { listProfiles } from '@/features/profiles/queries'
import { isUuid } from '@/lib/guards'
import { createClient } from '@/lib/supabase/server'
import { listGroupDirectory } from '@/features/groups/queries'
import { withThumbnails } from './images'
import { MESSAGE_PAGE, toMessage, type MessageRow } from './messages'
import type { ChatHeader, ChatListItem, ChatPage, DirectoryEntry } from './types'

// Chats read through RPCs that check the caller's membership and the community
// (supabase/migrations/20261018120000_chats.sql). Nothing here is cached across requests:
// messages, unread numbers and membership are always live.

// A1: the first 50 (the list searches them on the phone).
const CHAT_LIST_LIMIT = 50

// Unread chats first, then newest activity, in one call. cache(): the chats layout (desktop pane)
// and the A1 page share it within a request.
export const listChats = cache(async (slug: string): Promise<ChatListItem[]> => {
  const community = await getCommunity(slug)
  if (!community) return []
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('chat_list', { p_community: community.id, p_limit: CHAT_LIST_LIMIT })
  if (error) throw error
  return data.map((row) => ({
    id: row.chat_id,
    kind: row.kind === 'group' ? 'group' : 'dm',
    name: row.name,
    icon: row.other_icon ? profilePhotoUrl(row.other_icon) : null,
    lastMessage: row.preview,
    lastMessageAt: row.last_message_at,
    unread: Number(row.unread),
  }))
})

// A4 header (and the chat's sub-pages: notes, leave, calendar), or null when the viewer is not in
// this chat here. cache(): a page and its layout parts share it.
export const getChatHeader = cache(async (slug: string, chatId: string): Promise<ChatHeader | null> => {
  const community = await getCommunity(slug)
  if (!community || !isUuid(chatId)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('chat_header', { p_community: community.id, p_chat: chatId })
  if (error) throw error
  const row = data[0]
  return row
    ? {
        id: row.chat_id,
        kind: row.kind === 'group' ? 'group' : 'dm',
        name: row.name,
        otherUserId: row.other_user_id,
        lastSeq: Number(row.last_seq),
        blocked: row.blocked,
        manage: row.manage,
        canPost: row.can_post,
        allow: { comment: row.allow_commenting, react: row.allow_reactions, edit: row.allow_post_editing },
        calendar: row.calendar,
        infoHeadline: row.info_headline,
      }
    : null
})

// A4: the header and the newest messages, in one round trip (both calls run at once); the page's
// photo thumbnails are then signed in one Storage call (only when it has photos).
export async function getChatPage(slug: string, chatId: string, viewerId: string): Promise<ChatPage | null> {
  const community = await getCommunity(slug)
  if (!community || !isUuid(chatId)) return null
  const supabase = await createClient()
  const [header, messages, schema] = await Promise.all([
    getChatHeader(slug, chatId),
    supabase.rpc('list_messages', { p_community: community.id, p_chat: chatId, p_limit: MESSAGE_PAGE }),
    getProfileSchema(community.id),
  ])
  if (messages.error) throw messages.error
  if (!header) return null
  const statuses = Object.fromEntries(schema.statuses.map((status) => [status.id, status.label]))
  const rows = messages.data as MessageRow[]
  const page = rows.map((row) => toMessage(row, viewerId, header.kind === 'group', statuses)).reverse()
  return {
    ...header,
    messages: await withThumbnails(supabase, page),
    hasOlder: rows.length === MESSAGE_PAGE,
  }
}

// Status id → label, for the phone to label live group posts.
export async function getStatusLabels(slug: string): Promise<Record<string, string>> {
  const community = await getCommunity(slug)
  if (!community) return {}
  const schema = await getProfileSchema(community.id)
  return Object.fromEntries(schema.statuses.map((status) => [status.id, status.label]))
}

// B2 "DM": the viewer's DM with this person, or null (the DM page then starts one on the first message).
export async function findDm(slug: string, userId: string): Promise<string | null> {
  const community = await getCommunity(slug)
  if (!community || !isUuid(userId)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('find_dm', { p_community: community.id, p_user: userId })
  if (error) throw error
  return data
}

// A25: the applicant's DM with the community admin, only once the admin has written in it. Null
// until then: no "Chat with admin" button at all, not even a dimmed one.
export async function getAdminChatId(slug: string): Promise<string | null> {
  const community = await getCommunity(slug)
  if (!community) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_chat', { p_community: community.id })
  if (error) throw error
  return data
}

// A2 "Find new user/group". A user opens their profile; a group opens its join / apply screen (A24).
// People: the Profiles list's first page; groups: visible groups the viewer is not in. Both in one
// round trip. "Not connected yet" for people and typing to search (find_new) come with step 9.
export async function listDirectory(community: string, viewerId: string): Promise<DirectoryEntry[]> {
  const back = encodeURIComponent(`/${community}/chats/new`)
  const [profiles, directory] = await Promise.all([listProfiles(community), listGroupDirectory(community)])
  const people = profiles
    .filter((profile) => profile.id !== viewerId)
    .map((profile) => ({
      id: profile.id,
      kind: 'user' as const,
      name: profile.username,
      detail: [profile.status, profile.place || profile.district].filter(Boolean).join(' · '),
      href: `/${community}/profiles/${profile.id}?back=${back}`,
    }))
  const groups = directory.map((group) => ({
    id: group.id,
    kind: 'group' as const,
    name: group.name,
    detail: group.headline,
    href: `/${community}/groups/${group.id}/join`,
  }))
  return [...people, ...groups]
}
