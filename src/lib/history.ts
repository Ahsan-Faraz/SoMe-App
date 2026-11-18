'use client'

import { useRouter } from 'next/navigation'

// Back goes up one logical level: to the screen's parent (group info → the group's chat, an album →
// the albums list), never back into a form that was just saved (client feedback 261111).
// When the parent is already in this tab's history, the browser steps back to it, so that screen
// comes back as it was left (scroll position, what was typed in a search). Otherwise the parent is
// opened.

// The Navigation API (Chrome, Edge, Safari 26+, Firefox 147+). entries() only lists this site's pages.
type NavigationLike = { currentEntry: { index: number } | null; entries(): { url: string | null }[] }

const MAX_STEPS = 20 // never jump further back than this many screens

// How many steps back the nearest earlier screen with the parent's path is; 0 when it isn't in the
// history, or the browser can't tell (then the parent is opened instead).
function stepsBackTo(parent: string): number {
  const navigation = (window as { navigation?: NavigationLike }).navigation
  const index = navigation?.currentEntry?.index
  if (!navigation || index == null) return 0
  const { origin, pathname } = new URL(parent, location.href)
  const entries = navigation.entries()
  for (let i = index - 1; i >= 0 && index - i <= MAX_STEPS; i--) {
    const url = entries[i]?.url
    if (!url) continue
    const entry = new URL(url)
    if (entry.origin === origin && entry.pathname === pathname) return index - i
  }
  return 0
}

type Router = ReturnType<typeof useRouter>

// The header's back arrow: step back to the parent, or open it.
export function goUp(router: Router, parent: string) {
  const steps = stepsBackTo(parent)
  if (steps > 0) history.go(-steps)
  else router.push(parent)
}

// After a form is done (save, show, delete): the same, but when the parent has to be opened it takes
// the form's place in the history, so Back never returns to the form.
export function useGoBack() {
  const router = useRouter()
  return (parent: string) => {
    const steps = stepsBackTo(parent)
    if (steps > 0) history.go(-steps)
    else router.replace(parent)
  }
}
