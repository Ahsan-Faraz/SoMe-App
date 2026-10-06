'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { readStars } from '@/features/notes/stars'
import { t } from '@/lib/i18n'
import { loadAds, matches, watchAdFilter } from '../storage'
import { emptyAdFilter, type Ad, type AdFilter } from '../types'

// Ads in the first screenful: their images load eagerly (they are the LCP); the rest stay lazy.
const ABOVE_FOLD = 4

// Stable default, so the effect below does not re-run every render.
const noScores: Record<string, number> = {}

export function AdList({
  community,
  seed,
  onlyUserId,
  viewerId = '',
  scores = noScores,
}: {
  community: string
  seed: Ad[]
  // Set on a profile's Ads: show that member's ads, unfiltered.
  onlyUserId: string | null
  // For the D1 filter: whose stars to read, and each author's profile score.
  viewerId?: string
  scores?: Record<string, number>
}) {
  const [ads, setAds] = useState(seed)
  const [filter, setFilter] = useState<AdFilter>(emptyAdFilter)
  const [stars, setStars] = useState<Record<string, number>>({})

  useEffect(() => {
    const read = () => setAds(loadAds(community, seed))
    read()
    window.addEventListener('some-ads', read)
    return () => window.removeEventListener('some-ads', read)
  }, [community, seed])
  useEffect(() => {
    if (onlyUserId) return
    const unwatch = watchAdFilter(community, setFilter)
    setStars(readStars(community, viewerId, Object.keys(scores)))
    return unwatch
  }, [community, onlyUserId, viewerId, scores])

  const visible = useMemo(
    () => ads.filter((ad) => (onlyUserId ? ad.userId === onlyUserId : matches(ad, filter, scores[ad.userId] ?? 0, stars[ad.userId] ?? 0))),
    [ads, onlyUserId, filter, scores, stars],
  )

  return (
    <>
      {visible.length === 0 ? <p className="px-6 py-10 text-center text-muted">{t.ads.empty}</p> : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] p-2">
        {visible.map((ad, index) => (
          <li key={ad.id} className="[contain-intrinsic-size:auto_170px] [content-visibility:auto]">
            <Link href={`/${community}/ads/${ad.id}`} className="m-2 flex gap-3 rounded-2xl border border-line p-4 hover:border-accent/40">
              <Avatar name={ad.username} seed={ad.userId} />
              <span className="min-w-0 flex-1 text-[14px]">
                <span className="line-clamp-2 text-[16px] leading-snug font-bold">{ad.headline}</span>
                <span className="mt-1 block text-ink-soft">{ad.username}</span>
                <span className="block text-ink-soft">{ad.age}</span>
                <span className="block text-ink-soft">{ad.district}</span>
                <span className="block text-ink-soft">{ad.place}</span>
                <span className="mt-1 block text-[13px] text-muted">{ad.published}</span>
              </span>
              <span className="grid shrink-0 justify-items-end gap-1.5">
                <span className="rounded-full bg-rail px-2 py-0.5 text-[12px] font-semibold">{ad.status}</span>
                {ad.image ? (
                  ad.image.startsWith('data:') ? (
                    // An ad published on this device (data URL), which next/image does not serve.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ad.image} alt="" className="size-24 rounded-xl object-cover" />
                  ) : (
                    // Thumbnail only (96 px); the full image loads on the ad.
                    <Image src={ad.image} alt="" width={96} height={96} sizes="96px" loading={index < ABOVE_FOLD ? 'eager' : 'lazy'} className="size-24 rounded-xl object-cover" />
                  )
                ) : null}
                {ad.image && ad.verified ? <span className="text-[12px] font-semibold text-accent">✓ {t.chats.verified}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
