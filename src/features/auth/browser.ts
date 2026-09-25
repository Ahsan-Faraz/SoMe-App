import { MOCK_SESSION_COOKIE, roleForUsername } from '@/mocks/session'
import type { Role } from './types'

const MOCK_LATENCY_MS = 400

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function signIn(username: string, _password: string): Promise<{ role: Role }> {
  await wait(MOCK_LATENCY_MS)
  document.cookie = `${MOCK_SESSION_COOKIE}=${encodeURIComponent(username.trim())}; path=/; max-age=2592000; samesite=lax`
  return { role: roleForUsername(username) }
}

export async function signUp(_input: { username: string; password: string; email: string }): Promise<void> {
  await wait(MOCK_LATENCY_MS)
}

export function signOut(): void {
  document.cookie = `${MOCK_SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`
}
