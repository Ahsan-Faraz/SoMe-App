import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { MOCK_SESSION_COOKIE, roleForUsername } from '@/mocks/session'
import type { Viewer } from './types'

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const username = (await cookies()).get(MOCK_SESSION_COOKIE)?.value
  if (!username) return null
  return { userId: 'u-me', username, role: roleForUsername(username) }
})
