import 'server-only'
import { mockChats } from '@/mocks/data'
import type { ChatListItem } from './types'

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
