'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { peopleOf, profileLayout } from '@/features/fields/schema'
import type { Builtins, Choice, FieldDef, LayoutItem, StatusChoice } from '@/features/fields/types'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/browser'
import { toAnswers, type AnswerRows, type ProfileSearch } from '../cards'
import { filterCount } from '../filter'
import { MAX_STARS } from '../options'
import { useCardPages } from '../useCardPages'
import { ProfileActions } from './ProfileActions'
import { Fact, ProfileAnswers } from './ProfileAnswers'
import { ProfileImage } from './ProfileImage'

const SWIPE_PX = 60
// Load the next page this many profiles before the end.
const LOAD_AHEAD = 3
const headerButton = 'relative inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover'

type Answers = ReturnType<typeof toAnswers>
const noAnswers: Answers = { values: {}, photoValues: {} }

// A27 Browse profiles: one profile at a time through the saved filter (rated ones too), the same
// list as A5. Star a profile to rate it and move on; arrows (or swipe / ←→ keys) move without rating.
// The cards come in pages; each profile's answers load as it comes up (profile(), one call), the
// next one's ahead of time.
export function BrowseProfiles({
  community,
  search,
  statuses,
  substatuses,
  builtins,
  layout,
  fields,
}: {
  community: string
  search: ProfileSearch
  // The community's profile builder (active fields only).
  statuses: readonly StatusChoice[]
  substatuses: readonly Choice[]
  builtins: Builtins
  layout: readonly LayoutItem[]
  fields: readonly FieldDef[]
}) {
  const router = useRouter()
  const shown = useRef(false)
  const { cards, done, loadMore } = useCardPages(search)
  // Stars given here. The cards keep the stars they had when the screen opened, so rating never
  // reshuffles the list.
  const [rated, setRated] = useState<Record<string, number>>({})
  const [answers, setAnswers] = useState<Record<string, Answers>>({})
  const requested = useRef(new Set<string>())
  const [index, setIndex] = useState(0)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const self = `/${community}/profiles/swipe`
  const kinds = useMemo(() => new Map(fields.map((field) => [field.id, field.kind])), [fields])

  const last = Math.max(cards.length - 1, 0)
  const position = Math.min(index, last)
  const profile = cards[position]
  const next = cards[position + 1]
  const go = (by: number) => setIndex(Math.min(Math.max(position + by, 0), last))

  // Shown again after the filter or a profile's notes (pages stay alive): reload; a new filter starts over.
  useEffect(() => {
    if (shown.current) router.refresh()
    shown.current = true
  }, [router])

  useEffect(() => {
    if (!done && position >= cards.length - LOAD_AHEAD) void loadMore()
  }, [cards.length, done, loadMore, position])

  // This profile's answers, and the next one's; each asked for once (a failed one again on return).
  useEffect(() => {
    for (const id of [profile?.id, next?.id]) {
      if (!id || requested.current.has(id)) continue
      requested.current.add(id)
      void createClient()
        .rpc('profile', { p_community: search.communityId, p_user: id })
        .then(({ data, error }) => {
          if (error) return void requested.current.delete(id)
          // Null when the profile can't be seen any more (hidden or blocked since the list loaded).
          setAnswers((loaded) => ({ ...loaded, [id]: data ? toAnswers(data as unknown as AnswerRows, kinds) : noAnswers }))
        })
    }
  }, [kinds, next?.id, profile?.id, search.communityId])

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

  // My stars (set_note): shown at once, taken back if the database refuses.
  function rate(score: number) {
    if (!profile) return
    const id = profile.id
    const before = rated[id]
    setRated((current) => ({ ...current, [id]: score }))
    go(1)
    void createClient()
      .rpc('set_note', { p_community: search.communityId, p_subject: id, p_note: { stars: score } })
      .then(({ error }) => {
        if (error) setRated((current) => ({ ...current, [id]: before ?? 0 }))
      })
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touch.current
    const end = event.changedTouches[0]
    touch.current = null
    if (!start || !end) return
    const dx = end.clientX - start.x
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(end.clientY - start.y) * 2) go(dx < 0 ? 1 : -1)
  }

  const active = filterCount(search.filter)
  const current = profile ? (rated[profile.id] ?? profile.stars) : 0
  const status = profile ? statuses.find((choice) => choice.id === profile.statusId) : undefined
  const answered = profile ? (answers[profile.id] ?? noAnswers) : noAnswers

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
                <span className="flex-1 text-right text-[13px] text-muted tabular-nums">{t.browse.position(position + 1, cards.length)}</span>
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
                  // The full image sits next to its thumbnail: name.webp beside name_t.webp (private.insert_photo).
                  photo: (
                    <ProfileImage
                      photo={profile.photo ? { ...profile.photo, id: profile.id, src: profile.photo.src.replace(/_t\.(webp|jpg)$/, '.$1'), thumb: profile.photo.src } : null}
                      owner={null}
                      eager
                    />
                  ),
                  lookingFor: <Fact label={t.profiles.lookingFor} value={profile.lookingFor.join(', ') || '—'} />,
                  district: <Fact label={t.profiles.district} value={profile.district || '—'} />,
                  place: <Fact label={t.profiles.place} value={profile.place || '—'} />,
                  score: <Fact label={t.profiles.score} value={String(profile.score)} />,
                }}
                // One age per person with a birth date, in the Status's order.
                ages={Object.fromEntries(peopleOf(status, substatuses).map((person, index) => [person.key, profile.ages[index] ?? null]))}
                values={answered.values}
                photoValues={answered.photoValues}
              />
            </div>
          </main>
          <ProfileActions community={community} profile={{ id: profile.id, username: profile.username, own: false }} isAdmin={false} />
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
