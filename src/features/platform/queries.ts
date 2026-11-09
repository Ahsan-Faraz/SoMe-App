import 'server-only'
import { cache } from 'react'
import { getUserId } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import type { PlatformCommunity } from './types'

// Is the logged-in person the platform admin? Their own platform_admins row (RLS: read own).
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const userId = await getUserId()
  if (!userId) return false
  const supabase = await createClient()
  const { data, error } = await supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data !== null
})

// The platform screen: every community, with its member count and admins (platform_communities,
// empty for anyone but the platform admin).
export async function getPlatformCommunities(): Promise<PlatformCommunity[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_communities')
  if (error) throw error
  return data.map((row) => ({ id: row.id, slug: row.slug, name: row.name, directJoin: row.direct_join, members: row.members, admins: row.admins }))
}
