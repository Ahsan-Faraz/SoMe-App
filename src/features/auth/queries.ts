import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getCommunity } from '@/features/communities/queries'
import { profilePhotoUrl } from '@/features/profiles/photo'
import { getUserId } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import type { Viewer } from './types'

// The logged-in person's account in this community, or null (logged out, no account here,
// or rejected/removed). Applicants ('profile', 'applied') get the 'pending' role.
export const getViewer = cache(async (community: string): Promise<Viewer | null> => {
  const [userId, info] = await Promise.all([getUserId(), getCommunity(community)])
  if (!userId || !info) return null

  const supabase = await createClient()
  // One query: the account and its profile image (my_account; clients can't read `photos` themselves).
  const { data, error } = await supabase.rpc('my_account', { p_community: info.id }).maybeSingle()
  if (error) throw error
  if (!data) return null
  const icon = data.icon ? profilePhotoUrl(data.icon) : null

  if (data.state === 'approved') return { userId, username: data.username, icon, role: data.role === 'admin' ? 'admin' : 'member', canCreateGroups: data.can_create_groups }
  if (data.state === 'profile' || data.state === 'applied') return { userId, username: data.username, icon, role: 'pending', canCreateGroups: false }
  return null
})

// A logged-in, approved member (applicants go to their apply screen). A group's admin screens use
// this, then the group's scope (group_settings), which only its group admin or the community admin gets.
export async function requireMember(community: string): Promise<Viewer> {
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)
  return viewer
}

// Community admin screens (A19–A21, A31, A33). A group's screens check the group admin per group
// (group_settings).
export async function requireAdmin(community: string): Promise<Viewer> {
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'admin') redirect(`/${community}/chats`)
  return viewer
}
