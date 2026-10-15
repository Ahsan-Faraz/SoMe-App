'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { readStars, writeStars } from '@/features/notes/stars'
import { peopleOf, profileLayout, statusByLabel } from '@/features/fields/schema'
import type { Builtins, Choice, FieldDef, LayoutItem, StatusChoice } from '@/features/fields/types'
import { t } from '@/lib/i18n'
import { emptyFilter, filterCount, matchesProfile, watchFilter, type ProfileFilter } from '../filter'
import { MAX_STARS } from '../options'
import type { BrowseProfile } from '../types'
import { ProfileActions } from './ProfileActions'
import { Fact, ProfileAnswers } from './ProfileAnswers'
import { ProfileImage } from './ProfileImage'

const SWIPE_PX = 60
const headerButton = 'relative inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover'

// A27 Browse profiles: one profile at a time through the filtered list (rated ones too).
// Star a profile to rate it and move on; arrows (or swipe / ←→ keys) move without rating.
export function BrowseProfiles({
  community,
  viewerId,
  profiles,
  chatIds,
  statuses,
  substatuses,
  builtins,
  layout,
  fields,
}: {
  community: string
  viewerId: string
  profiles: BrowseProfile[]
  chatIds: Record<string, string>
  // The community's profile builder (active fields only).
  statuses: readonly StatusChoice[]
  substatuses: readonly Choice[]
  builtins: Builtins
  layout: readonly LayoutItem[]
  fields: readonly FieldDef[]
}) {
  const [filter, setFilter] = useState<ProfileFilter>(emptyFilter)
  // Stars as they were when the screen opened: they decide what the filter lets through, so rating
  // a profile never reshuffles the list. `rated` holds the stars given here.
  const [stars, setStars] = useState<Record<string, number>>({})
  const [rated, setRated] = useState<Record<string, number>>({})
  const [index, setIndex] = useState(0)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const query = useDeferredValue(filter.text.trim().toLowerCase())
  const self = `/${community}/profiles/swipe`

  useEffect(() => watchFilter(community, setFilter), [community])
  useEffect(() => setStars(readStars(community, viewerId, profiles.map((profile) => profile.id))), [community, viewerId, profiles])

  const visible = useMemo(() => profiles.filter((profile) => matchesProfile(profile, stars[profile.id] ?? 0, filter, query)), [profiles, filter, query, stars])
  const last = Math.max(visible.length - 1, 0)
  const position = Math.min(index, last)
  const profile = visible[position]
  const go = (by: number) => setIndex(Math.min(Math.max(position + by, 0), last))

  // Desktop: ← and → move between profiles.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]')) return
      if (event.key === 'ArrowLeft') setIndex(Math.max(position - 1, 0))
      if (event.key === 'ArrowRight') setIndex(Math.min(position + 1, last))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [position, last])

  function rate(score: number) {
    if (!profile) return
    writeStars(community, viewerId, profile.id, score)
    setRated((current) => ({ ...current, [profile.id]: score }))
    go(1)
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touch.current
    const end = event.changedTouches[0]
    touch.current = null
    if (!start || !end) return
    const dx = end.clientX - start.x
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(end.clientY - start.y) * 2) go(dx < 0 ? 1 : -1)
  }

  const active = filterCount(filter)
  const current = profile ? (rated[profile.id] ?? stars[profile.id] ?? 0) : 0
  // Mock profiles name their Status (backend step 9 brings real ones with ids).
  const status = profile ? statusByLabel({ statuses }, profile.status) : undefined

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader
        title={t.browse.title}
        backHref={`/${community}/profiles`}
        right={
          <Link href={`/${community}/profiles/filter?back=${encodeURIComponent(self)}`} aria-label={t.profiles.filter} title={t.profiles.filter} className={headerButton}>
            <Icon name="filter" />
            {active > 0 ? <span className="absolute top-1 right-1 grid size-4.5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">{active}</span> : null}
          </Link>
        }
      />
      {profile ? (
        <>
          {/* Keyed per profile: each one opens at the top. */}
          <main
            key={profile.id}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
            onTouchStart={(event) => {
              const point = event.touches[0]
              touch.current = point ? { x: point.clientX, y: point.clientY } : null
            }}
            onTouchEnd={onTouchEnd}
          >
            <div className="mx-auto w-full max-w-2xl px-5 pt-4 pb-8 sm:px-8">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="min-w-0 truncate text-[20px] font-bold">{profile.username}</h2>
                <span className="shrink-0 text-[17px]">{profile.ages.join(' / ')}</span>
                <span className="flex-1 text-right text-[13px] text-muted tabular-nums">{t.browse.position(position + 1, visible.length)}</span>
                <Link
                  href={`/${community}/profiles/${profile.id}/notes?back=${encodeURIComponent(self)}`}
                  aria-label={t.profiles.notes}
                  title={t.profiles.notes}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-hover"
                >
                  <Icon name="star" className="size-6" />
                </Link>
              </div>
              <ProfileAnswers
                top={
                  <div className="mb-6 rounded-2xl bg-sunken p-4">
                    <Fact label={t.profiles.status} value={profile.status || '—'} />
                  </div>
                }
                layout={profileLayout({ layout, fields, builtins, substatuses }, status)}
                nodes={{
                  photo: <ProfileImage photo={profile.photo ? { ...profile.photo, id: profile.id, thumb: profile.photo.src } : null} owner={null} eager />,
                  lookingFor: <Fact label={t.profiles.lookingFor} value={profile.lookingFor.join(', ') || '—'} />,
                  district: <Fact label={t.profiles.district} value={profile.district || '—'} />,
                  place: <Fact label={t.profiles.place} value={profile.place || '—'} />,
                  score: <Fact label={t.profiles.score} value={String(profile.score)} />,
                }}
                // A mock profile has one age: the first person's.
                ages={Object.fromEntries(peopleOf(status, substatuses).map((person, index) => [person.key, profile.ages[index] ?? null]))}
                values={profile.values}
              />
            </div>
          </main>
          <ProfileActions community={community} profile={{ id: profile.id, username: profile.username, own: false }} chatId={chatIds[profile.id] ?? null} isAdmin={false} />
          <nav aria-label={t.browse.title} className="flex shrink-0 items-center justify-between gap-1 border-t border-line bg-canvas px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
            <button type="button" aria-label={t.browse.previous} title={t.browse.previous} disabled={position === 0} onClick={() => go(-1)} className="grid size-12 place-items-center rounded-full hover:bg-hover disabled:opacity-30">
              <Icon name="chevronLeft" className="size-7" />
            </button>
            <span className="flex">
              {Array.from({ length: MAX_STARS }, (_, i) => (
                <button key={i} type="button" aria-label={t.browse.rate(i + 1)} title={t.browse.rate(i + 1)} aria-pressed={i < current} onClick={() => rate(i + 1)} className="grid size-12 place-items-center rounded-full hover:bg-hover">
                  <Icon name="starSolid" className={`size-7 ${i < current ? 'text-amber-500' : 'text-line-strong'}`} />
                </button>
              ))}
            </span>
            <button type="button" aria-label={t.browse.next} title={t.browse.next} disabled={position >= last} onClick={() => go(1)} className="grid size-12 place-items-center rounded-full hover:bg-hover disabled:opacity-30">
              <Icon name="chevronRight" className="size-7" />
            </button>
          </nav>
        </>
      ) : (
        <p className="px-6 py-10 text-center text-muted">{t.profiles.empty}</p>
      )}
    </div>
  )
}
