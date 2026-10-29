'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Icon } from '@/components/ui/Icon'
import { dmHref } from '@/features/chats/links'
import { dateLocale, locale, t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/browser'
import { monthStart, toEvent, type CalEvent, type CalMonth } from '../types'

const monthName = new Intl.DateTimeFormat(dateLocale[locale], { month: 'long' })
const dayHeading = new Intl.DateTimeFormat(dateLocale[locale], { day: 'numeric', month: 'long', year: 'numeric' })

const pad = (value: number) => String(value).padStart(2, '0')
const iso = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`
const monthKey = (year: number, month: number) => `${year}-${pad(month + 1)}`

// B2. The server reads the month it opens on (initial); the phone reads each other month once, when
// it is opened (calendar_month, one call), and again after a change. Deleting goes straight to the
// database (delete_event checks the group's admins), asked first.
export function CalendarBoard({
  community,
  communityId,
  chatId,
  initial,
  day: initialDay,
  base,
  isAdmin,
}: {
  community: string
  communityId: string
  chatId: string
  initial: CalMonth
  day: number // the day picked first, in the initial month
  base: string
  isAdmin: boolean
}) {
  const [startYear = 0, startMonth = 1] = initial.month.split('-').map(Number)
  const [cursor, setCursor] = useState({ year: startYear, month: startMonth - 1 })
  const [day, setDay] = useState(initialDay)
  // Months read on the phone. stale: the server's initial month is out of date (shown again after a change).
  const [loaded, setLoaded] = useState<Record<string, CalEvent[]>>({})
  const [stale, setStale] = useState(false)
  const [ask, setAsk] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()
  const shown = useRef(false)
  const reading = useRef(new Set<string>())

  const { year, month } = cursor
  const key = monthKey(year, month)
  const events = loaded[key] ?? (key === initial.month && !stale ? initial.events : undefined)

  const load = useCallback(
    async (target: string) => {
      // Once at a time per month (flicking back and forth doesn't read it twice).
      if (reading.current.has(target)) return
      reading.current.add(target)
      const { data, error } = await createClient().rpc('calendar_month', { p_community: communityId, p_chat: chatId, p_month: monthStart(target) })
      reading.current.delete(target)
      if (error) setError(t.common.error)
      else setLoaded((current) => ({ ...current, [target]: data.map(toEvent) }))
    },
    [communityId, chatId],
  )

  // A month not read yet is read when it is opened.
  useEffect(() => {
    if (events === undefined) void load(key)
  }, [events, key, load])

  // Pages stay alive between visits: back from adding or editing an event, every month is read again
  // when it is next shown (the open one at once, by the effect above).
  useEffect(() => {
    if (shown.current) {
      setLoaded({})
      setStale(true)
    }
    shown.current = true
  }, [])

  function remove(event: CalEvent) {
    setAsk(null)
    setError('')
    const before = events ?? []
    setLoaded((current) => ({ ...current, [key]: before.filter((item) => item.id !== event.id) }))
    startTransition(async () => {
      const { error } = await createClient().rpc('delete_event', { p_community: communityId, p_chat: chatId, p_event: event.id })
      if (error) {
        setError(t.calendar.notSaved)
        void load(key)
      }
    })
  }

  const count = new Date(year, month + 1, 0).getDate()
  const safeDay = Math.min(day, count)
  const selected = iso(year, month, safeDay)
  const marked = new Set((events ?? []).map((event) => event.date))
  const listed = (events ?? []).filter((event) => event.date === selected)
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)]

  function shiftMonth(by: number) {
    const next = new Date(year, month + by, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
  }

  return (
    <div className="px-4 pt-5 pb-10 sm:px-8">
      <div className="grid max-w-md grid-cols-2 gap-2">
        <Stepper label={monthName.format(new Date(year, month, 1))} onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)} prevLabel={t.calendar.monthPrev} nextLabel={t.calendar.monthNext} />
        <Stepper label={String(year)} onPrev={() => setCursor({ year: year - 1, month })} onNext={() => setCursor({ year: year + 1, month })} prevLabel={t.calendar.yearPrev} nextLabel={t.calendar.yearNext} />
      </div>
      <div className="mt-5 grid grid-cols-7 gap-1 text-center">
        {cells.map((value, index) => {
          if (value === null) return <span key={`pad-${index}`} />
          const date = iso(year, month, value)
          const on = date === selected
          const has = marked.has(date)
          return (
              <button
                key={date}
                type="button"
                aria-pressed={on}
                onClick={() => setDay(value)}
                className={`mx-auto grid size-10 place-items-center rounded-full text-[15px] font-semibold ${
                  on ? 'bg-accent text-white' : has ? 'text-accent ring-2 ring-accent' : 'text-ink hover:bg-rail'
                }`}
              >
                {value}
              </button>
          )
        })}
      </div>
      <h2 className="mt-6 border-t border-line pt-5 text-[20px] font-bold">{dayHeading.format(new Date(year, month, safeDay))}</h2>
      {error ? (
        <p role="alert" className="mt-3 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      {events === undefined ? null : listed.length === 0 ? <p className="mt-3 text-[16px] text-muted">{t.calendar.empty}</p> : null}
      <ul className="mt-2 divide-y divide-line">
        {listed.map((event) => (
          <li key={event.id} className="flex items-start gap-3 py-4">
            <span className="min-w-0 flex-1">
              <EventBody event={event} />
            </span>
            <span className="grid shrink-0 justify-items-end gap-1">
              {event.creatorId ? (
                <Link
                  href={dmHref(community, event.creatorId)}
                  aria-label={t.calendar.dmLabel(event.headline)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-soft px-3 text-[15px] font-semibold hover:bg-soft-hover"
                >
                  <Icon name="chatSolid" className="size-4 text-accent" />
                  {t.calendar.dm}
                </Link>
              ) : null}
              {isAdmin ? (
                ask === event.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => remove(event)}
                      className="h-10 rounded-xl bg-danger px-3 text-[15px] font-semibold text-white"
                    >
                      {t.calendar.delete}
                    </button>
                    <button type="button" onClick={() => setAsk(null)} className="h-10 rounded-xl bg-soft px-3 text-[15px] font-semibold">
                      {t.chats.cancel}
                    </button>
                  </span>
                ) : (
                  <span className="flex">
                    <Link href={`${base}/${event.id}?date=${event.date}`} aria-label={t.calendar.edit} title={t.calendar.edit} className="grid size-10 place-items-center rounded-full text-ink hover:bg-hover">
                      <Icon name="pencil" className="size-5" />
                    </Link>
                    <button type="button" aria-label={t.calendar.delete} title={t.calendar.delete} onClick={() => setAsk(event.id)} className="grid size-10 place-items-center rounded-full text-ink hover:bg-danger/10 hover:text-danger">
                      <Icon name="trash" className="size-5" />
                    </button>
                  </span>
                )
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EventBody({ event }: { event: CalEvent }) {
  return (
    <>
      <span className="block text-[17px] font-bold">{event.headline}</span>
      <span className="mt-1 block text-[16px] leading-relaxed text-ink-soft">{event.text}</span>
    </>
  )
}

function Stepper({ label, onPrev, onNext, prevLabel, nextLabel }: { label: string; onPrev: () => void; onNext: () => void; prevLabel: string; nextLabel: string }) {
  return (
    <span className="flex h-11 items-center rounded-xl border border-line bg-canvas">
      <button type="button" aria-label={prevLabel} onClick={onPrev} className="grid h-11 w-9 shrink-0 place-items-center rounded-l-xl hover:bg-rail">
        <Icon name="chevronLeft" className="size-5" />
      </button>
      <span className="min-w-0 flex-1 truncate text-center text-[16px] font-bold">{label}</span>
      <button type="button" aria-label={nextLabel} onClick={onNext} className="grid h-11 w-9 shrink-0 place-items-center rounded-r-xl hover:bg-rail">
        <Icon name="chevronRight" className="size-5" />
      </button>
    </span>
  )
}
