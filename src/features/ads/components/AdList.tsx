'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { t } from '@/lib/i18n'
import { loadAds, matches, watchAdFilter } from '../storage'
import { emptyAdFilter, type Ad, type AdFilter } from '../types'

export function AdList({
  community,
  seed,
  onlyUserId,
}: {
  community: string
  seed: Ad[]
  onlyUserId: string | null
}) {
  const [ads, setAds] = useState(seed)
  const [filter, setFilter] = useState<AdFilter>(emptyAdFilter)

  useEffect(() => {
    const read = () => setAds(loadAds(community, seed))
    read()
    window.addEventListener('some-ads', read)
    return () => window.removeEventListener('some-ads', read)
  }, [community, seed])
  useEffect(() => watchAdFilter(community, setFilter), [community])

  const visible = ads.filter((ad) => (onlyUserId ? ad.userId === onlyUserId : matches(ad, filter)))

  return (
    <>
      {visible.length === 0 ? <p className="px-6 py-10 text-center text-muted">{t.ads.empty}</p> : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] p-2">
        {visible.map((ad) => (
          <li key={ad.id} className="[contain-intrinsic-size:auto_140px] [content-visibility:auto]">
            <Link href={`/${community}/ads/${ad.id}`} className="m-2 flex gap-3 rounded-2xl border border-line p-4 hover:border-accent/40">
              <Avatar name={ad.username} seed={ad.userId} />
              <span className="min-w-0 flex-1 text-[14px]">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[16px] font-bold">{ad.headline}</span>
                  <span className="shrink-0 rounded-full bg-rail px-2 py-0.5 text-[12px] font-semibold">{ad.status}</span>
                </span>
                <span className="mt-1 block text-ink-soft">{ad.username}</span>
                <span className="block text-ink-soft">{ad.age}</span>
                <span className="block text-ink-soft">{ad.district}</span>
                <span className="block text-ink-soft">{ad.place}</span>
                <span className="mt-1 block text-[13px] text-muted">{ad.published}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
