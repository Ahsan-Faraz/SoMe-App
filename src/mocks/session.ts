import type { Role } from '@/features/auth/types'

// Stand-in for the Supabase session cookie during the UI phase.
export const MOCK_SESSION_COOKIE = 'some_mock_session'

export function roleForUsername(username: string): Role {
  const name = username.trim().toLowerCase()
  if (name === 'admin') return 'admin'
  if (name === 'pending') return 'pending'
  return 'member'
}
