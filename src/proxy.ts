import { type NextRequest, NextResponse } from 'next/server'
import { communityForHost } from '@/lib/domains'
import { isSupabaseConfigured } from '@/lib/env'
import { updateSession } from '@/lib/supabase/proxy'

// Top-level routes that are not a community's (app/auth/confirm) and Next.js internals.
const PLATFORM_ROUTES = new Set(['auth', '_next'])
// A file (public/community/hero.png, robots.txt…): served as it is, never as a community page.
const FILE = /\.[a-z0-9]+$/i

// Refreshes the session, and serves a community's own domain (D30): club-example.com/chats is
// /{slug}/chats. A path that already starts with the community's slug passes through, so links built
// as /{slug}/… keep working there; any other community's slug ends in a 404 on that domain. No
// database queries here: the host → community map is a setting (lib/domains.ts).
export function proxy(request: NextRequest) {
  const slug = communityForHost(request.headers.get('host'))
  let rewrite: URL | null = null
  if (slug) {
    const { pathname } = request.nextUrl
    const first = pathname.split('/')[1] ?? ''
    if (first !== slug && !PLATFORM_ROUTES.has(first) && !FILE.test(pathname)) {
      rewrite = request.nextUrl.clone()
      rewrite.pathname = `/${slug}${pathname === '/' ? '' : pathname}`
    }
  }
  // UI-only phase runs on mock data without a Supabase project.
  if (!isSupabaseConfigured) return rewrite ? NextResponse.rewrite(rewrite) : NextResponse.next()
  return updateSession(request, rewrite)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icons/|sw\\.js|manifest\\.webmanifest|favicon\\.ico|icon\\.png|apple-icon\\.png).*)'],
}
