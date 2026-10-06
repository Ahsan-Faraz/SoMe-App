import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { MOCK_SESSION_COOKIE, roleForUsername } from '@/mocks/session'
import type { Viewer } from './types'

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const username = (await cookies()).get(MOCK_SESSION_COOKIE)?.value
  if (!username) return null
  return { userId: 'u-me', username, role: roleForUsername(username) }
})

// Admin screens (A19–A33). Group admins get their own check when that role exists; until then
// only the community admin runs groups.
export async function requireAdmin(community: string): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'admin') redirect(`/${community}/chats`)
  return viewer
}
