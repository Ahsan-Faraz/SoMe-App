'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { Avatar } from '@/components/ui/Avatar'
import { readStars } from '@/features/notes/stars'
import { t } from '@/lib/i18n'
import { emptyFilter, filterCount, matchesProfile, watchFilter, type ProfileFilter } from '../filter'
import type { Builtins } from '@/features/fields/types'
import { MAX_STARS } from '../options'
import type { ProfileCard } from '../types'

// Cards in the first screenful: their photos load eagerly (they are the LCP); the rest stay lazy.
const ABOVE_FOLD = 4

const headerButton = 'relative inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover'

// builtins: the basic fields this community shows; the others are left off the cards.
export function ProfileList({ community, viewerId, profiles, builtins }: { community: string; viewerId: string; profiles: ProfileCard[]; builtins: Builtins }) {
  const [filter, setFilter] = useState<ProfileFilter>(emptyFilter)
  const [stars, setStars] = useState<Record<string, number>>({})
  const query = useDeferredValue(filter.text.trim().toLowerCase())

  useEffect(() => watchFilter(community, setFilter), [community])
  useEffect(() => setStars(readStars(community, viewerId, profiles.map((profile) => profile.id))), [community, viewerId, profiles])

  const visible = useMemo(() => profiles.filter((profile) => matchesProfile(profile, stars[profile.id] ?? 0, filter, query)), [profiles, stars, filter, query])
  const active = filterCount(filter)

  return (
    <>
      <ScreenHeader
        title={t.profiles.title}
        right={
          <span className="flex">
            <Link href={`/${community}/profiles/swipe`} aria-label={t.profiles.swipe} title={t.profiles.swipe} className={headerButton}>
              <Icon name="swap" />
            </Link>
            <ThemeToggle className={`${headerButton} rail:hidden`} />
            <Link href={`/${community}/profiles/filter`} aria-label={t.profiles.filter} title={t.profiles.filter} className={headerButton}>
              <Icon name="filter" />
              {active > 0 ? <span className="absolute top-1 right-1 grid size-4.5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">{active}</span> : null}
            </Link>
          </span>
        }
      />
      {visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-muted">{t.profiles.empty}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] p-1.5 sm:p-2">
          {visible.map((profile, index) => (
            <li key={profile.id} className="[contain-intrinsic-size:auto_124px] [content-visibility:auto]">
              <ProfileRow community={community} profile={profile} builtins={builtins} stars={stars[profile.id] ?? 0} eager={index < ABOVE_FOLD} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// Layout from the client: Username Age Status / District+Place / Profile score, My stars / Looking for.
// Photo + Verified on the right. Kept to four short lines to fit more profiles per screen.
function ProfileRow({ community, profile, builtins, stars, eager }: { community: string; profile: ProfileCard; builtins: Builtins; stars: number; eager: boolean }) {
  // "District, Place": the place once when it is the district's name.
  const district = builtins.district ? profile.district : ''
  const place = builtins.place && profile.place !== district ? profile.place : ''
  const where = [district, place].filter(Boolean).join(', ')
  return (
    <Link
      href={`/${community}/profiles/${profile.id}`}
      className="m-1.5 flex gap-3 rounded-2xl border border-line p-3 hover:border-accent/40 hover:bg-accent/[0.03] sm:m-2"
    >
      <span className="grid min-w-0 flex-1 content-start gap-0.5 text-[14px] text-ink-soft">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[16px] font-bold text-ink">{profile.username}</span>
          {builtins.age ? <span className="shrink-0 text-[15px] text-ink">{profile.ages.join(' / ')}</span> : null}
          {profile.status ? <span className="shrink-0 rounded-full bg-rail px-2 py-0.5 text-[12px] font-semibold text-ink">{profile.status}</span> : null}
        </span>
        {where ? <span className="truncate">{where}</span> : null}
        <span className="flex items-center gap-3">
          {builtins.score ? (
            <span>
              {t.profiles.scoreShort} <span className="font-semibold text-ink">{profile.score}</span>
            </span>
          ) : null}
          <Stars count={stars} />
        </span>
        {builtins.lookingFor && profile.lookingFor.length > 0 ? (
          <span className="truncate">
            {t.profiles.lookingFor}: <span className="font-semibold text-ink">{profile.lookingFor.join(', ')}</span>
          </span>
        ) : null}
      </span>
      <span className="grid shrink-0 content-start justify-items-end gap-1">
        {builtins.photo && profile.photo ? (
          // The Storage thumbnail (about 256 px), cached for a year; the full image loads on the profile.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.photo.src} alt="" width={80} height={80} loading={eager ? 'eager' : 'lazy'} decoding="async" className="size-20 rounded-xl object-cover" />
        ) : (
          <span className="grid size-20 place-items-center rounded-xl bg-sunken">
            <Avatar name={profile.username} seed={profile.id} />
          </span>
        )}
        {builtins.photo && profile.photo?.verified ? <span className="text-[12px] font-semibold text-accent">✓ {t.chats.takenInApp}</span> : null}
      </span>
    </Link>
  )
}

function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center" role="img" aria-label={`${t.profiles.stars}: ${t.notes.rate(count)}`} title={t.profiles.stars}>
      {Array.from({ length: MAX_STARS }, (_, index) => (
        <Icon key={index} name="starSolid" className={`size-3.5 ${index < count ? 'text-amber-500' : 'text-line-strong'}`} />
      ))}
    </span>
  )
}
