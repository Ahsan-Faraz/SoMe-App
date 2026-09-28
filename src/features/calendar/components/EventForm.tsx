'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { loadEvents, saveEvents, type CalEvent } from '../storage'

export function EventForm({
  storageKey,
  seed,
  eventId,
  date,
}: {
  storageKey: string
  seed: CalEvent[]
  eventId: string | null
  date: string
}) {
  const router = useRouter()
  const [when, setWhen] = useState(date)
  const [headline, setHeadline] = useState('')
  const [text, setText] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const events = loadEvents(storageKey, seed)
    const current = eventId ? events.find((event) => event.id === eventId) : undefined
    if (current) {
      setWhen(current.date)
      setHeadline(current.headline)
      setText(current.text)
    }
    setReady(true)
  }, [storageKey, seed, eventId])

  function write(next: CalEvent[]) {
    saveEvents(storageKey, next)
    router.back()
  }

  return (
    <form
      className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-lg flex-col px-4 pt-6 sm:px-8"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready || !headline.trim()) return
        const events = loadEvents(storageKey, seed)
        const id = eventId ?? `ev-${Date.now()}`
        const next = { id, date: when, headline: headline.trim(), text: text.trim() }
        write(eventId ? events.map((item) => (item.id === eventId ? next : item)) : [...events, next])
      }}
    >
      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.calendar.date}
        <input type="date" required value={when} onChange={(event) => setWhen(event.target.value)} className="h-11 rounded-xl border border-line bg-canvas px-3 text-[16px] font-normal outline-none focus:border-accent" />
      </label>
      <label className="mt-4 grid gap-1.5 text-[14px] font-semibold">
        {t.calendar.headline}
        <input required value={headline} onChange={(event) => setHeadline(event.target.value)} className="h-11 rounded-xl border border-line bg-canvas px-3 text-[16px] font-normal outline-none focus:border-accent" />
      </label>
      <label className="mt-4 grid gap-1.5 text-[14px] font-semibold">
        {t.calendar.text}
        <textarea required value={text} onChange={(event) => setText(event.target.value)} rows={5} className="rounded-xl border border-line bg-canvas px-3 py-2 text-[16px] font-normal outline-none focus:border-accent" />
      </label>
      <div className="mt-auto flex gap-3 pt-8 pb-6">
        <Button type="submit" className="flex-1">{t.calendar.save}</Button>
        {eventId ? (
          <Button
            type="button"
            variant="secondary"
            className="flex-1 text-danger!"
            onClick={() => write(loadEvents(storageKey, seed).filter((event) => event.id !== eventId))}
          >
            {t.calendar.delete}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
