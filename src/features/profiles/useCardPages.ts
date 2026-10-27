import { useCallback, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { CARDS_PAGE, nextPage, toCard, type ProfileSearch } from './cards'
import type { ProfileCard } from './types'

// The Profiles list and swipe: the server's first page (props), then the next pages straight from
// the database as they are needed (search_profiles, keyset after the last card). A refreshed first
// page keeps the pages already loaded; a card is never listed twice.
export function useCardPages(search: ProfileSearch) {
  const [more, setMore] = useState<ProfileCard[]>([])
  const [done, setDone] = useState(search.cards.length < CARDS_PAGE)
  const loading = useRef(false)

  const cards = useMemo(() => {
    const first = new Set(search.cards.map((card) => card.id))
    return [...search.cards, ...more.filter((card) => !first.has(card.id))]
  }, [search.cards, more])

  const loadMore = useCallback(async () => {
    if (loading.current || done) return
    loading.current = true
    const { data, error } = await createClient().rpc('search_profiles', { p_community: search.communityId, p_limit: CARDS_PAGE, ...nextPage(cards) })
    loading.current = false
    // A failed page is tried again on the next scroll.
    if (error) return
    setMore((current) => [...current, ...data.map((row) => toCard(row, search.labels))])
    if (data.length < CARDS_PAGE) setDone(true)
  }, [cards, done, search.communityId, search.labels])

  return { cards, done, loadMore }
}
