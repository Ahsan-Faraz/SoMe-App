import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/env'
import type { Database } from './database.types'

// Service role: bypasses RLS. Only for privileged server work (login lookup, album URL signing, system DMs).
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) throw new Error('Missing SUPABASE_SECRET_KEY')

  return createClient<Database>(getSupabaseEnv().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
