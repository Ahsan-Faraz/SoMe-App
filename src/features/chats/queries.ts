import 'server-only'
import { formatChatTime } from '@/lib/format'
import { mockChats, mockGroups, mockMessages, mockUsers } from '@/mocks/data'
import type { ChatListItem, ChatThread, DirectoryEntry } from './types'

const PAGE_LIMIT = 50

// Unread chats first, then newest activity — the same order the chat_list RPC will return.
export async function listChats(_communitySlug: string, now: number): Promise<ChatListItem[]> {
  return mockChats
    .map(({ minutesAgo, ...chat }) => ({ ...chat, lastMessageAt: new Date(now - minutesAgo * 60_000).toISOString() }))
    .sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0) || b.lastMessageAt.localeCompare(a.lastMessageAt))
    .slice(0, PAGE_LIMIT)
}

// The DM between the viewer and the community admin (AD → A4). Real version finds or creates it.
export async function getAdminChatId(_communitySlug: string): Promise<string> {
  return 'dm-admin'
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

export async function listDirectory(community: string): Promise<DirectoryEntry[]> {
  const people = mockUsers.map((user) => ({
    id: user.id,
    kind: 'user' as const,
    name: user.username,
    detail: '',
    href: `/${community}/chats/${userChats[user.id] ?? 'dm-admin'}`,
  }))
  const groups = mockGroups.map((group) => ({
    id: group.id,
    kind: 'group' as const,
    name: group.name,
    detail: group.headline,
    href: group.directJoin ? `/${community}/chats/${group.id}` : `/${community}/chats/dm-admin`,
  }))
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
    messages: messages.map((message, index) => ({
      id: `${chatId}-${index}`,
      author: message.author,
      authorId: message.mine ? null : mockUsers.find((user) => user.username === message.author)?.id ?? null,
      mine: message.mine,
      body: message.body,
      timeLabel: formatChatTime(new Date(now - message.minutesAgo * 60_000).toISOString(), now),
      reactions: message.reactions ?? null,
      comment: message.comment ?? null,
      image: message.image ?? false,
    })),
  }
}
