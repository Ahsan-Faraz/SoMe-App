import { type NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/env'
import { updateSession } from '@/lib/supabase/proxy'

export function proxy(request: NextRequest) {
  // UI-only phase runs on mock data without a Supabase project.
  if (!isSupabaseConfigured) return NextResponse.next()
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icons/|sw\\.js|manifest\\.webmanifest|favicon\\.ico).*)'],
}
