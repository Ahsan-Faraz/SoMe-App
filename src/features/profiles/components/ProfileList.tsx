'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { Avatar } from '@/components/ui/Avatar'
import { t } from '@/lib/i18n'
import { emptyFilter, filterCount, watchFilter, type ProfileFilter } from '../filter'
import type { ProfileCard } from '../types'

export function ProfileList({ community, profiles }: { community: string; profiles: ProfileCard[] }) {
  const [filter, setFilter] = useState<ProfileFilter>(emptyFilter)
  const query = useDeferredValue(filter.text.trim().toLowerCase())

  useEffect(() => watchFilter(community, setFilter), [community])

  const visible = useMemo(() => {
    const min = filter.minAge === '' ? null : Number(filter.minAge)
    const max = filter.maxAge === '' ? null : Number(filter.maxAge)
    return profiles.filter((profile) => {
      if (filter.picked.length > 0 && !filter.picked.includes(profile.status)) return false
      if (min !== null && profile.age < min) return false
      if (max !== null && profile.age > max) return false
      if (!query) return true
      return `${profile.username} ${profile.headline} ${profile.district}`.toLowerCase().includes(query)
    })
  }, [profiles, filter, query])

  const active = filterCount(filter)

  return (
    <>
      <ScreenHeader
        title={t.profiles.title}
        right={
          <span className="flex">
            <ThemeToggle className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover rail:hidden" />
            <Link
              href={`/${community}/profiles/filter`}
              aria-label={t.profiles.filter}
              className="relative inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover"
            >
              <Icon name="filter" />
              {active > 0 ? (
                <span className="absolute right-1 top-1 grid size-4.5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">{active}</span>
              ) : null}
            </Link>
          </span>
        }
      />
      {visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-muted">{t.profiles.empty}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] p-2">
          {visible.map((profile) => (
            <li key={profile.id} className="[contain-intrinsic-size:auto_170px] [content-visibility:auto]">
              <Link href={`/${community}/profiles/${profile.id}`} className="m-2 flex gap-3 rounded-2xl border border-line p-4 hover:border-accent/40 hover:bg-accent/[0.03]">
                <Avatar name={profile.username} seed={profile.id} />
                <span className="min-w-0 flex-1 text-[14px]">
                  <span className="block truncate text-[16px] font-bold">{profile.username}</span>
                  <span className="mt-1 block text-ink-soft">{profile.age}</span>
                  <span className="block text-ink-soft">{profile.district}</span>
                  <span className="block text-ink-soft">{profile.place}</span>
                  <span className="mt-1 block truncate font-semibold text-ink">{profile.headline}</span>
                </span>
                <span className="grid shrink-0 justify-items-end gap-1.5">
                  <span className="rounded-full bg-rail px-2 py-0.5 text-[12px] font-semibold">{profile.status}</span>
                  {profile.photo ? (
                    <>
                      {/* Thumbnail only (96 px); the full image loads on the profile. */}
                      <Image src={profile.photo.src} alt="" width={96} height={96} sizes="96px" className="size-24 rounded-xl object-cover" />
                      {profile.photo.verified ? <span className="text-[12px] font-semibold text-accent">✓ {t.chats.verified}</span> : null}
                    </>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
