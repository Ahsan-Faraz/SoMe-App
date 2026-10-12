'use client'

import { useRouter } from 'next/navigation'

// The Navigation API (Chrome, Edge, Safari 26+, Firefox 147+). entries() only lists this site's pages.
type NavigationLike = { currentEntry: { index: number } | null; entries(): { url: string | null }[] }

// Back means back: go to the page the user came from, when that page is part of this community.
// Not when the screen was opened from outside (a link, a fresh app start, a reload of a deep page):
// then there is nothing to go back to, and the screen's own parent is used instead.
export function canGoBack(community: string): boolean {
  const inCommunity = (url: string | null | undefined) => {
    if (!url) return false
    const { origin, pathname } = new URL(url, location.href)
    return origin === location.origin && (pathname === `/${community}` || pathname.startsWith(`/${community}/`))
  }
  const navigation = (window as { navigation?: NavigationLike }).navigation
  if (navigation?.currentEntry) return inCommunity(navigation.entries()[navigation.currentEntry.index - 1]?.url)
  // Older browsers: if this tab has moved since the page loaded, the previous entry is in the app.
  const loaded = performance.getEntriesByType('navigation')[0]?.name
  return Boolean(loaded) && loaded !== location.href && inCommunity(loaded)
}

// After a form is done (save, show, delete): return to where it was opened from.
export function useGoBack(community: string) {
  const router = useRouter()
  return (fallback: string) => (canGoBack(community) ? router.back() : router.replace(fallback))
}
