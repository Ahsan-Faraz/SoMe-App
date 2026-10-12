import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getCommunity } from '@/features/communities/queries'
import { getUserId } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import type { Viewer } from './types'

// The logged-in person's account in this community, or null (logged out, no account here,
// or rejected/removed). Applicants ('profile', 'applied') get the 'pending' role.
export const getViewer = cache(async (community: string): Promise<Viewer | null> => {
  const [userId, info] = await Promise.all([getUserId(), getCommunity(community)])
  if (!userId || !info) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('members')
    .select('username, role, state')
    .eq('community_id', info.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  if (data.state === 'approved') return { userId, username: data.username, role: data.role === 'admin' ? 'admin' : 'member' }
  if (data.state === 'profile' || data.state === 'applied') return { userId, username: data.username, role: 'pending' }
  return null
})

// Admin screens (A19–A33). Group admins get their own check when that role exists; until then
// only the community admin runs groups.
export async function requireAdmin(community: string): Promise<Viewer> {
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'admin') redirect(`/${community}/chats`)
  return viewer
}
