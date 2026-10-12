'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { Avatar } from '@/components/ui/Avatar'
import { readStars } from '@/features/notes/stars'
import { t } from '@/lib/i18n'
import { emptyFilter, filterCount, matchesProfile, watchFilter, type ProfileFilter } from '../filter'
import { MAX_STARS, whereLabel } from '../options'
import { readStatus } from '../status'
import type { ProfileCard } from '../types'

// Cards in the first screenful: their photos load eagerly (they are the LCP); the rest stay lazy.
const ABOVE_FOLD = 4

const headerButton = 'relative inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover'

export function ProfileList({ community, viewerId, profiles: serverProfiles }: { community: string; viewerId: string; profiles: ProfileCard[] }) {
  const [profiles, setProfiles] = useState(serverProfiles)
  const [filter, setFilter] = useState<ProfileFilter>(emptyFilter)
  const [stars, setStars] = useState<Record<string, number>>({})
  const query = useDeferredValue(filter.text.trim().toLowerCase())

  useEffect(() => watchFilter(community, setFilter), [community])
  // A status the community admin changed on this device (until the profile table exists).
  // Only re-renders the list when such a change exists.
  useEffect(() => {
    const changed = serverProfiles.map((profile) => ({ ...profile, status: readStatus(community, profile.id) ?? profile.status }))
    setProfiles(changed.some((profile, i) => profile.status !== serverProfiles[i]?.status) ? changed : serverProfiles)
  }, [community, serverProfiles])
  // Keyed on the server list (same ids), so the status read above does not read the stars a second time.
  useEffect(() => setStars(readStars(community, viewerId, serverProfiles.map((profile) => profile.id))), [community, viewerId, serverProfiles])

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
              <ProfileRow community={community} profile={profile} stars={stars[profile.id] ?? 0} eager={index < ABOVE_FOLD} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// Layout from the client: Username Age Status / District+Place / Profile score, My stars / Looking for.
// Photo + Verified on the right. Kept to four short lines to fit more profiles per screen.
function ProfileRow({ community, profile, stars, eager }: { community: string; profile: ProfileCard; stars: number; eager: boolean }) {
  return (
    <Link
      href={`/${community}/profiles/${profile.id}`}
      className="m-1.5 flex gap-3 rounded-2xl border border-line p-3 hover:border-accent/40 hover:bg-accent/[0.03] sm:m-2"
    >
      <span className="grid min-w-0 flex-1 content-start gap-0.5 text-[14px] text-ink-soft">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[16px] font-bold text-ink">{profile.username}</span>
          <span className="shrink-0 text-[15px] text-ink">{profile.age}</span>
          <span className="shrink-0 rounded-full bg-rail px-2 py-0.5 text-[12px] font-semibold text-ink">{profile.status}</span>
        </span>
        <span className="truncate">{whereLabel(profile.district, profile.place)}</span>
        <span className="flex items-center gap-3">
          <span>
            {t.profiles.scoreShort} <span className="font-semibold text-ink">{profile.score}</span>
          </span>
          <Stars count={stars} />
        </span>
        {profile.lookingFor.length > 0 ? (
          <span className="truncate">
            {t.profiles.lookingFor}: <span className="font-semibold text-ink">{profile.lookingFor.join(', ')}</span>
          </span>
        ) : null}
      </span>
      <span className="grid shrink-0 content-start justify-items-end gap-1">
        {profile.photo ? (
          // Thumbnail only (80 px); the full image loads on the profile.
          <Image src={profile.photo.src} alt="" width={80} height={80} sizes="80px" loading={eager ? 'eager' : 'lazy'} className="size-20 rounded-xl object-cover" />
        ) : (
          <span className="grid size-20 place-items-center rounded-xl bg-sunken">
            <Avatar name={profile.username} seed={profile.id} />
          </span>
        )}
        {profile.photo?.verified ? <span className="text-[12px] font-semibold text-accent">✓ {t.chats.takenInApp}</span> : null}
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
