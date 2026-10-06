import 'server-only'
import { cache } from 'react'
import { formatPostTime, formatStamp } from '@/lib/format'
import { mockChats, mockGroups, mockMessages, mockProfiles } from '@/mocks/data'
import type { ChatListItem, ChatThread, DirectoryEntry } from './types'

const PAGE_LIMIT = 50

// Unread chats first, then newest activity — the same order the chat_list RPC will return.
// cache(): the chats layout (desktop pane) and the A1 page share one query per request.
export const listChats = cache(async (_communitySlug: string): Promise<ChatListItem[]> => {
  const now = Date.now()
  return mockChats
    .map(({ minutesAgo, ...chat }) => ({ ...chat, lastMessageAt: new Date(now - minutesAgo * 60_000).toISOString() }))
    .sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0) || b.lastMessageAt.localeCompare(a.lastMessageAt))
    .slice(0, PAGE_LIMIT)
})

// A25: the DM with the community admin, only once the admin has written first. Null until then.
export async function getAdminChatId(_communitySlug: string): Promise<string | null> {
  return (mockMessages['dm-admin'] ?? []).some((message) => !message.mine) ? 'dm-admin' : null
}

const userChats: Record<string, string> = {
  'u-admin': 'dm-admin',
  'u-anna': 'dm-anna',
  'u-erik': 'dm-erik',
  'u-sara': 'dm-sara',
  'u-jonas': 'dm-jonas',
}

export function chatIdForUser(userId: string): string | null {
  return userChats[userId] ?? null
}

// The other person in a DM, so notes about them are the same from the chat and their profile.
export function dmPartnerId(chatId: string): string | null {
  return Object.keys(userChats).find((userId) => userChats[userId] === chatId) ?? null
}

// A2 "Find new user/group": only people and groups the viewer is not connected to yet.
// A user opens their profile; a group opens its join / apply screen (A24).
export async function listDirectory(community: string, viewerId: string): Promise<DirectoryEntry[]> {
  const inList = new Set(mockChats.map((chat) => chat.id))
  const back = encodeURIComponent(`/${community}/chats/new`)
  const people = mockProfiles
    .filter((profile) => profile.id !== viewerId && !inList.has(userChats[profile.id] ?? ''))
    .map((profile) => ({ id: profile.id, kind: 'user' as const, name: profile.username, detail: profile.headline, href: `/${community}/profiles/${profile.id}?back=${back}` }))
  const groups = mockGroups
    .filter((group) => !inList.has(group.id))
    .map((group) => ({ id: group.id, kind: 'group' as const, name: group.name, detail: group.headline, href: `/${community}/groups/${group.id}/join` }))
  return [...people, ...groups]
}

export async function getChatSummary(chatId: string): Promise<{ id: string; kind: 'group' | 'dm'; name: string } | null> {
  const chat = mockChats.find((item) => item.id === chatId)
  return chat ? { id: chat.id, kind: chat.kind, name: chat.name } : null
}

export async function getChat(chatId: string, now: number): Promise<ChatThread | null> {
  const chat = mockChats.find((item) => item.id === chatId)
  if (!chat) return null
  const messages = mockMessages[chatId] ?? []
  return {
    id: chat.id,
    kind: chat.kind,
    name: chat.name,
    messages: messages.map((message, index) => {
      const profile = message.mine ? undefined : mockProfiles.find((item) => item.username === message.author)
      return {
        id: `${chatId}-${index}`,
        author: message.author,
        authorId: profile?.id ?? null,
        authorStatus: chat.kind === 'group' ? (profile?.status ?? null) : null,
        mine: message.mine,
        body: message.body,
        timeLabel: formatPostTime(new Date(now - message.minutesAgo * 60_000).toISOString()),
        reactions: (message.reactions ?? []).map((reaction) => ({ ...reaction, mine: false })),
        replyTo: message.replyTo ?? null,
        image: message.image ?? false,
        imageSrc: null,
        verified: message.image ?? false,
        verifiedDate: message.image ? formatStamp(now - message.minutesAgo * 60_000) : null,
      }
    }),
  }
}
