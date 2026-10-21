'use server'

import { redirect } from 'next/navigation'
import { getCommunity } from '@/features/communities/queries'
import { isUuid } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { deletePrivateFiles } from '@/lib/supabase/private-files'

export type LeaveMode = 'keep' | 'delete' | 'leave'
export type ChatResult = { error: string } | undefined

// G1/A4 "Leave" (D12): a DM is kept read-only ("keep") or deleted for both ("delete"), and the other
// person is blocked either way; a group is left ("leave"). One RPC that checks the caller
// (supabase/migrations/20261020120000_blocks.sql). Then the chat (kept) or the chat list.
export async function leaveChatAction(slug: string, chatId: string, mode: LeaveMode): Promise<ChatResult> {
  if (!isUuid(chatId) || !['keep', 'delete', 'leave'].includes(mode)) return { error: t.common.error }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('leave_chat', { p_community: community.id, p_chat: chatId, p_mode: mode })
  if (error) return { error: error.code === '42501' ? t.leave.notAllowed : t.common.error }
  deletePrivateFiles(data)
  redirect(mode === 'keep' ? `/${slug}/chats/${chatId}` : `/${slug}/chats`)
}

// B3/B5 "Delete": a post (and its comments). The database checks who may; their images go from
// Storage after the response. The chat screen removes the post itself (and gets the broadcast).
export async function deleteMessageAction(slug: string, chatId: string, seq: number): Promise<ChatResult> {
  if (!isUuid(chatId) || !Number.isSafeInteger(seq) || seq < 1) return { error: t.common.error }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_message', { p_community: community.id, p_chat: chatId, p_seq: seq })
  if (error) return { error: error.code === '42501' ? t.chats.notAllowed : t.common.error }
  deletePrivateFiles(data)
}
