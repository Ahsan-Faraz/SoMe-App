'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { loadEvents, saveEvents, subscribe, type CalEvent } from '../storage'

const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long' })
const dayHeading = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function CalendarBoard({
  storageKey,
  seed,
  base,
  isAdmin,
}: {
  storageKey: string
  seed: CalEvent[]
  base: string
  isAdmin: boolean
}) {
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [day, setDay] = useState(today.getDate())
  const [events, setEvents] = useState(seed)
  const [ask, setAsk] = useState<string | null>(null)

  useEffect(() => {
    const refresh = () => setEvents(loadEvents(storageKey, seed))
    refresh()
    return subscribe(refresh)
  }, [storageKey, seed])

  const { year, month } = cursor
  const count = new Date(year, month + 1, 0).getDate()
  const safeDay = Math.min(day, count)
  const selected = iso(year, month, safeDay)
  const marked = new Set(events.filter((event) => event.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).map((event) => event.date))
  const listed = events.filter((event) => event.date === selected)
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
      {listed.length === 0 ? <p className="mt-3 text-[16px] text-muted">{t.calendar.empty}</p> : null}
      <ul className="mt-2 divide-y divide-line">
        {listed.map((event) => (
          <li key={event.id} className="flex items-start gap-2 py-4">
            <span className="min-w-0 flex-1">
              <EventBody event={event} />
            </span>
            {isAdmin ? (
              ask === event.id ? (
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      saveEvents(storageKey, events.filter((item) => item.id !== event.id))
                      setAsk(null)
                    }}
                    className="h-10 rounded-xl bg-danger px-3 text-[15px] font-semibold text-white"
                  >
                    {t.calendar.delete}
                  </button>
                  <button type="button" onClick={() => setAsk(null)} className="h-10 rounded-xl bg-soft px-3 text-[15px] font-semibold">
                    {t.chats.cancel}
                  </button>
                </span>
              ) : (
                <span className="flex shrink-0">
                  <Link href={`${base}/${event.id}`} aria-label={t.calendar.edit} title={t.calendar.edit} className="grid size-10 place-items-center rounded-full text-ink hover:bg-hover">
                    <Icon name="pencil" className="size-5" />
                  </Link>
                  <button type="button" aria-label={t.calendar.delete} title={t.calendar.delete} onClick={() => setAsk(event.id)} className="grid size-10 place-items-center rounded-full text-ink hover:bg-danger/10 hover:text-danger">
                    <Icon name="trash" className="size-5" />
                  </button>
                </span>
              )
            ) : null}
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
