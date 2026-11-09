'use server'

import { refresh } from 'next/cache'
import { getCommunity } from '@/features/communities/queries'
import { isUuid } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

export type BlockResult = { error: string } | undefined

// Unblock (client feedback 261102): one RPC, unblock (supabase/migrations/20261103120000_feedback_261102.sql),
// which removes only your own block and reopens a kept DM for writing when no block is left.
export async function unblockAction(slug: string, userId: string): Promise<BlockResult> {
  if (!isUuid(userId)) return { error: t.common.error }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { error } = await supabase.rpc('unblock', { p_community: community.id, p_user: userId })
  if (error) return { error: t.common.error }
  refresh()
}
