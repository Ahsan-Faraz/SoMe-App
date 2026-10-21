import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseEnv } from '@/lib/env'

// Refreshes the login session on every request. rewrite: serve this URL instead (a community's own
// domain, src/proxy.ts); the session cookies go on whichever response is returned.
export async function updateSession(request: NextRequest, rewrite: URL | null = null) {
  const respond = () => (rewrite ? NextResponse.rewrite(rewrite, { request }) : NextResponse.next({ request }))
  let response = respond()
  const { url, key } = getSupabaseEnv()

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = respond()
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        for (const [headerName, value] of Object.entries(headers)) response.headers.set(headerName, value)
      },
    },
  })

  // Must run before returning: it refreshes an expiring token and triggers setAll.
  await supabase.auth.getClaims()

  return response
}
