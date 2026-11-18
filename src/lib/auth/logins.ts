import 'server-only'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { createClient } from '@/lib/supabase/server'

// Logins per site (supabase/migrations/20261110130000_logins.sql). Supabase Auth holds an internal
// address per login; the real email and the site live in public.logins. Everything here runs on the
// server with the service role: the browser never sees an internal address before it is logged in,
// and never asks Supabase Auth to send an email.

export type Login = { userId: string; authEmail: string; email: string; confirmed: boolean }

// The login behind an email on this site, or behind a username in this community. One indexed query.
export async function findLogin(site: string, communityId: string, login: string): Promise<Login | null> {
  const { data, error } = await createAdminClient().rpc('login_lookup', { p_site: site, p_community: communityId, p_login: login }).maybeSingle()
  if (error) throw error
  return data ? { userId: data.user_id, authEmail: data.auth_email, email: data.email, confirmed: data.confirmed } : null
}

// The address Supabase Auth gets for a new login. `.invalid` can never receive mail (RFC 2606).
export const newAuthEmail = (site: string) => `${randomUUID()}@${site}.login.invalid`

// The sign-up holder: a random token in a cookie of the browser that typed the password. Its hash is
// saved with the sign-up code, and the code only confirms the sign-up in that browser. So nobody can
// start a sign-up with someone else's email and have the owner confirm it for them.
const HOLDER_COOKIE = 'signup'
const HOLDER_SECONDS = 60 * 60 // as long as a code lives

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function newHolder(): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const jar = await cookies()
  jar.set(HOLDER_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: HOLDER_SECONDS })
  return hash(token)
}

export async function currentHolder(): Promise<string | null> {
  const token = (await cookies()).get(HOLDER_COOKIE)?.value
  return token ? hash(token) : null
}

export async function clearHolder() {
  ;(await cookies()).delete(HOLDER_COOKIE)
}

// A new 6-digit code for the login (the database keeps only its hash). Null if it couldn't be made.
export async function newCode(userId: string, kind: 'signup' | 'reset', holderHash: string | null): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc('login_code_new', { p_user: userId, p_kind: kind, p_holder_hash: holderHash as string })
  if (error) console.error('Login code not made:', error.message)
  return error ? null : data
}

// Log the person in on this device without their password, after a code proved the email: a
// one-time token made by the server and used at once. No email is sent.
export async function signInAs(supabase: Awaited<ReturnType<typeof createClient>>, authEmail: string): Promise<boolean> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: 'magiclink', email: authEmail })
  if (error) {
    console.error('Sign-in token not made:', error.message)
    return false
  }
  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' })
  if (verifyError) console.error('Sign-in token not accepted:', verifyError.message)
  return !verifyError
}
