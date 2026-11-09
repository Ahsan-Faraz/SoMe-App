import 'server-only'
import { getCommunity } from '@/features/communities/queries'
import { profilePhotoUrl } from '@/features/profiles/photo'
import { createClient } from '@/lib/supabase/server'
import type { BlockedPerson } from './types'

// "Blocked people": the people you blocked here, newest first (my_blocks, at most 500). Never cached:
// blocks change with every leave and unblock.
export async function getMyBlocks(slug: string): Promise<BlockedPerson[]> {
  const community = await getCommunity(slug)
  if (!community) return []
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_blocks', { p_community: community.id })
  if (error) throw error
  return data.map((row) => ({ userId: row.user_id, username: row.username, icon: row.icon ? profilePhotoUrl(row.icon) : null }))
}
