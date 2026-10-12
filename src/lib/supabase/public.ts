import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from '@/lib/env'
import type { Database } from './database.types'

// No cookies, so it can run inside 'use cache'. Reads as `anon`: public rows only.
export function createPublicClient() {
  const { url, key } = getSupabaseEnv()
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
