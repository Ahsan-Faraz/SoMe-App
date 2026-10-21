import { formatStamp } from '@/lib/format'
import { t } from '@/lib/i18n'
import type { ChatMessage, Reaction } from './types'

// Pure helpers for messages, shared by the server (first page) and the phone (live messages,
// older pages, catching up). No server-only or browser-only imports.

// The newest page and each older page (list_messages' p_limit).
export const MESSAGE_PAGE = 30
// Catching up after a reconnect: a full page back means there may be a gap (reload the newest).
export const CATCH_UP_LIMIT = 100

// A post's photo as the database returns it (paths in the private bucket, to sign).
export type PhotoRow = { path: string; thumb_path: string; width: number | null; height: number | null; taken_in_app: boolean; taken_at: string | null }

// A message as list_messages() returns it and send_message() broadcasts it
// (supabase/migrations/20261022120000_post_actions.sql).
export type MessageRow = {
  seq: number
  author_id: string
  author_name: string
  author_status_id: string | null
  kind: string
  body: string | null
  client_id: string | null
  created_at: string
  edited_at?: string | null
  reply_to_seq?: number | null
  reply_author?: string | null
  reply_snippet?: string | null
  photo?: PhotoRow | null
  reactions?: Record<string, number> | null
  my_reaction?: string | null
}

export function isMessageRow(value: unknown): value is MessageRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    Number.isSafeInteger(row.seq) &&
    typeof row.author_id === 'string' &&
    typeof row.author_name === 'string' &&
    (row.author_status_id === null || typeof row.author_status_id === 'string') &&
    (row.body === null || typeof row.body === 'string') &&
    (row.client_id === null || typeof row.client_id === 'string') &&
    typeof row.created_at === 'string'
  )
}

// statuses: Status id → label, from the community's profile builder. A group post shows its
// author's Status; DMs and your own posts don't.
export function toMessage(row: MessageRow, viewerId: string, group: boolean, statuses: Record<string, string>): ChatMessage {
  const mine = row.author_id === viewerId
  const photo = row.photo ?? null
  return {
    id: String(row.seq),
    seq: row.seq,
    clientId: row.client_id,
    author: mine ? t.chats.you : row.author_name,
    authorId: mine ? null : row.author_id,
    authorStatus: group && !mine && row.author_status_id ? (statuses[row.author_status_id] ?? null) : null,
    mine,
    system: row.kind === 'system',
    body: row.body ?? '',
    createdAt: row.created_at,
    state: 'sent',
    reactions: toReactions(row.reactions ?? {}, row.my_reaction ?? null),
    edited: Boolean(row.edited_at),
    replyTo: row.reply_to_seq ? { seq: row.reply_to_seq, author: row.reply_author ?? '', body: row.reply_snippet ?? '' } : null,
    image: photo !== null,
    photo: photo ? { path: photo.path, thumbPath: photo.thumb_path, width: photo.width, height: photo.height } : null,
    imageSrc: null,
    verified: photo?.taken_in_app ?? false,
    verifiedDate: photo?.taken_in_app && photo.taken_at ? formatStamp(photo.taken_at) : null,
  }
}

// The counts kept on the post, as chips: most used first; `mine` marks the viewer's own reaction.
export function toReactions(counts: Record<string, number>, mine: string | null): Reaction[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji, count]) => ({ emoji, count, mine: emoji === mine }))
}

// Your one reaction (D20), shown at once: tap the same emoji again to take it back, another to move it.
export function pickReaction(reactions: Reaction[], emoji: string | null): Reaction[] {
  const without = reactions.flatMap((reaction) => (reaction.mine ? (reaction.count > 1 ? [{ ...reaction, count: reaction.count - 1, mine: false }] : []) : [reaction]))
  if (!emoji) return without
  const target = without.find((reaction) => reaction.emoji === emoji)
  return target ? without.map((reaction) => (reaction === target ? { ...reaction, count: reaction.count + 1, mine: true } : reaction)) : [...without, { emoji, count: 1, mine: true }]
}

// Adds saved messages to what is on screen: each number once (a newer copy replaces an older one),
// a message you are sending is replaced by its saved copy (same clientId), oldest first; messages
// still sending or failed stay at the end, in the order they were written. A signed image already on
// screen is kept when a copy without one arrives (the live copy carries paths only).
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return current
  const bySeq = new Map<number, ChatMessage>()
  const savedSeq = new Map<string, number>() // clientId → its saved number
  for (const message of incoming) {
    if (message.seq === null) continue
    bySeq.set(message.seq, message)
    if (message.clientId) savedSeq.set(message.clientId, message.seq)
  }
  // Keep a picture already on screen: a copy without one (paths only) doesn't replace it.
  const keepImage = (seq: number, shown: ChatMessage) => {
    const fresh = bySeq.get(seq)
    if (fresh && !fresh.imageSrc && shown.imageSrc) bySeq.set(seq, { ...fresh, imageSrc: shown.imageSrc })
  }
  const unsent: ChatMessage[] = []
  for (const message of current) {
    if (message.seq !== null) {
      if (bySeq.has(message.seq)) keepImage(message.seq, message)
      else bySeq.set(message.seq, message)
    } else {
      const seq = message.clientId ? savedSeq.get(message.clientId) : undefined
      if (seq === undefined) unsent.push(message)
      else keepImage(seq, message) // your own photo while it was sending: the picked image stays
    }
  }
  return [...[...bySeq.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)), ...unsent]
}

// The newest saved message on screen (0 = none): what to mark read and to catch up from.
export function newestSeq(messages: ChatMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const seq = messages[index]?.seq
    if (seq !== null && seq !== undefined) return seq
  }
  return 0
}
