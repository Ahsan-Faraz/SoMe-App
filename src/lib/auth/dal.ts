import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return data?.claims.sub ?? null
})
