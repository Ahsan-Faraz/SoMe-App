import 'server-only'
import { headers } from 'next/headers'
import { isIP } from 'node:net'
import { createAdminClient } from './supabase/admin'

// Our own limits on the sign-in steps (supabase/migrations/20261031120000_launch.sql). They run on
// our server, so Supabase Auth sees the server's IP for every user and its per-IP limits can't tell
// people apart. Each attempt takes a slot per IP and per login (an email, or a typed username) before
// it runs; a success gives the slot back. The database keeps only hashes of the keys.

export type Bucket = 'password' | 'code' | 'email'

// Attempts per window: per IP (generous: many people can share one, e.g. at work) and per login.
const LIMITS: Record<Bucket, { ip: number; login: number; seconds: number }> = {
  password: { ip: 30, login: 5, seconds: 15 * 60 }, // log in, join with a login, delete my account
  code: { ip: 30, login: 5, seconds: 15 * 60 }, // the 6-digit codes: sign-up, password reset
  email: { ip: 10, login: 3, seconds: 60 * 60 }, // emails we make Supabase send: sign-up, resend, reset
}

// The visitor's IP as the proxy in front of the app reports it (Vercel and most hosts set
// x-real-ip / x-forwarded-for). IPv6 counts per /64: one person easily has a whole /64.
// Null when there is no usable header: then only the per-login limit applies, never one shared key
// for everyone.
async function clientIp(): Promise<string | null> {
  const list = await headers()
  // An IPv4 address written as IPv6 (::ffff:1.2.3.4) counts as the IPv4 address.
  const raw = (list.get('x-real-ip') ?? list.get('x-forwarded-for')?.split(',')[0] ?? '').trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '')
  const kind = isIP(raw)
  if (kind === 4) return raw
  if (kind === 6) return expandV6(raw).slice(0, 4).join(':') + '::/64'
  return null
}

// '2001:db8::1' -> ['2001', 'db8', '0', '0', '0', '0', '0', '1'] (an IPv4 tail counts as two groups).
function expandV6(address: string): string[] {
  const [head, tail = ''] = address.toLowerCase().split('::')
  const groups = (part: string) => (part ? part.split(':').flatMap((group) => (group.includes('.') ? ['0', '0'] : [parseInt(group, 16).toString(16)])) : [])
  const left = groups(head ?? '')
  const right = groups(tail)
  return [...left, ...Array<string>(Math.max(8 - left.length - right.length, 0)).fill('0'), ...right]
}

export type Attempt = { wait: number; keys: string[] }

// Take one attempt for this login (lower-cased). wait > 0: refuse, and say how many seconds.
// If the check itself fails, the attempt is refused too: a broken limit must not let everyone through.
export async function takeAttempt(bucket: Bucket, login: string): Promise<Attempt> {
  const limit = LIMITS[bucket]
  const ip = await clientIp()
  const keys = [`login:${login.toLowerCase().slice(0, 300)}`, ...(ip ? [`ip:${ip}`] : [])]
  const max = [limit.login, ...(ip ? [limit.ip] : [])]
  const { data, error } = await createAdminClient().rpc('rate_limit_take', { p_bucket: bucket, p_keys: keys, p_max: max, p_window_seconds: limit.seconds })
  if (error) {
    console.error('Rate limit check failed:', error.message)
    return { wait: 60, keys: [] }
  }
  return { wait: data, keys }
}

// After a success: give the attempt back, so people who get it right are never limited.
export async function refundAttempt(bucket: Bucket, attempt: Attempt) {
  if (attempt.keys.length === 0) return
  const { error } = await createAdminClient().rpc('rate_limit_refund', { p_bucket: bucket, p_keys: attempt.keys })
  if (error) console.error('Rate limit refund failed:', error.message)
}

// "Wait N minutes" for the form.
export const waitMinutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60))
