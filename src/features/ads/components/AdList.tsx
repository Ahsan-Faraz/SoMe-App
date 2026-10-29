'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { t } from '@/lib/i18n'
import { moreAdsAction } from '../actions'
import { ADS_PAGE, type AdCard } from '../types'

// Ads in the first screenful: their images load eagerly (they are the LCP); the rest stay lazy.
const ABOVE_FOLD = 4
// Start loading the next page this far before the end of the list.
const LOAD_AHEAD = '600px'

// A6 (paged: the Ads tab, through the saved filter, newest first, more pages on scroll) and a
// profile's Ads (one member's, all on the first page). Cards come from the server with their
// thumbnails signed; pages stay alive between visits, so the list reloads when it is shown again
// (a new or edited ad, a new filter, someone's new age or Status).
export function AdList({ community, cards: first, paged }: { community: string; cards: AdCard[]; paged: boolean }) {
  const router = useRouter()
  const shown = useRef(false)
  const end = useRef<HTMLDivElement>(null)
  const loading = useRef(false)
  const [more, setMore] = useState<AdCard[]>([])
  const [done, setDone] = useState(!paged || first.length < ADS_PAGE)

  useEffect(() => {
    if (shown.current) router.refresh()
    shown.current = true
  }, [router])

  // A refreshed first page keeps the pages already loaded; an ad is never listed twice.
  const cards = useMemo(() => {
    const seen = new Set(first.map((card) => card.id))
    return [...first, ...more.filter((card) => !seen.has(card.id))]
  }, [first, more])

  const loadMore = useCallback(async () => {
    const last = cards.at(-1)
    if (loading.current || done || !last) return
    loading.current = true
    try {
      const page = await moreAdsAction(community, { publishedAt: last.publishedAt, id: last.id })
      setMore((current) => [...current, ...page])
      if (page.length < ADS_PAGE) setDone(true)
    } catch {
      // A failed page is tried again on the next scroll.
    } finally {
      loading.current = false
    }
  }, [cards, community, done])

  useEffect(() => {
    const node = end.current
    if (!node || done) return
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && void loadMore(), { rootMargin: LOAD_AHEAD })
    observer.observe(node)
    return () => observer.disconnect()
  }, [done, loadMore])

  return (
    <>
      {cards.length === 0 ? <p className="px-6 py-10 text-center text-muted">{t.ads.empty}</p> : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] p-2">
        {cards.map((ad, index) => (
          <li key={ad.id} className="[contain-intrinsic-size:auto_170px] [content-visibility:auto]">
            <Link href={`/${community}/ads/${ad.id}`} className="m-2 flex gap-3 rounded-2xl border border-line p-4 hover:border-accent/40">
              <Avatar name={ad.username} seed={ad.userId} />
              <span className="min-w-0 flex-1 text-[14px]">
                <span className="line-clamp-2 text-[16px] leading-snug font-bold">{ad.headline}</span>
                <span className="mt-1 block text-ink-soft">{ad.username}</span>
                <span className="block text-ink-soft">{ad.ages.join(', ')}</span>
                <span className="block text-ink-soft">{ad.district}</span>
                <span className="block text-ink-soft">{ad.place}</span>
                <span className="mt-1 block text-[13px] text-muted">{ad.published}</span>
              </span>
              <span className="grid shrink-0 justify-items-end gap-1.5">
                {ad.status ? <span className="rounded-full bg-rail px-2 py-0.5 text-[12px] font-semibold">{ad.status}</span> : null}
                {ad.image ? (
                  // A signed thumbnail (256 px) from the private bucket; the full image loads on the ad.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ad.image} alt="" width={96} height={96} loading={index < ABOVE_FOLD ? 'eager' : 'lazy'} decoding="async" className="size-24 rounded-xl object-cover" />
                ) : null}
                {ad.image && ad.verified ? <span className="text-[12px] font-semibold text-accent">✓ {t.chats.takenInApp}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {paged ? <div ref={end} aria-hidden /> : null}
    </>
  )
}
