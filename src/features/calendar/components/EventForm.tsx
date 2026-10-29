'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { useGoBack } from '@/lib/history'
import { t } from '@/lib/i18n'
import { HEADLINE_MAX, LONG_TEXT_MAX } from '@/lib/limits'
import { createClient } from '@/lib/supabase/browser'
import type { CalEvent } from '../types'

// Add (event null) or edit an event: save_event / delete_event check the group's admins, the
// lengths and the date in the database. Seeded from the saved event: the page keys this form by it.
export function EventForm({
  community,
  communityId,
  chatId,
  backHref,
  event,
  date,
}: {
  community: string
  communityId: string
  chatId: string
  backHref: string
  event: CalEvent | null
  date: string
}) {
  const goBack = useGoBack(community)
  const router = useRouter()
  const [when, setWhen] = useState(event?.date ?? date)
  const [headline, setHeadline] = useState(event?.headline ?? '')
  const [text, setText] = useState(event?.text ?? '')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  // After a save, the calendar opens on the event's date: back to where the form was opened from when
  // that shows the same month, else that month (an event added to or moved into another month is
  // shown where it now is).
  function showSaved() {
    const month = when.slice(0, 7)
    if (new URL(backHref, location.href).searchParams.get('m') === month) goBack(backHref)
    else router.replace(`${backHref.split('?')[0]}?m=${month}&d=${Number(when.slice(8))}`)
  }

  const failed = (code: string) => setError(code === '42501' ? t.calendar.notAllowed : code === '22023' ? t.calendar.invalid : t.common.error)

  function save() {
    setError('')
    startTransition(async () => {
      const { error } = await createClient().rpc('save_event', {
        p_community: communityId,
        p_chat: chatId,
        // null = a new event (the generated types can't say a uuid argument may be null)
        p_event: (event?.id ?? null) as string,
        p_data: { on_date: when, headline: headline.trim(), body: text.trim() },
      })
      if (error) failed(error.code)
      else showSaved()
    })
  }

  function remove(current: CalEvent) {
    if (!window.confirm(t.calendar.deleteConfirm(current.headline))) return
    setError('')
    startTransition(async () => {
      const { error } = await createClient().rpc('delete_event', { p_community: communityId, p_chat: chatId, p_event: current.id })
      if (error) failed(error.code)
      else goBack(backHref)
    })
  }

  return (
    <form
      className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-lg flex-col px-4 pt-6 sm:px-8"
      onSubmit={(submit) => {
        submit.preventDefault()
        if (headline.trim()) save()
      }}
    >
      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.calendar.date}
        <input type="date" required value={when} onChange={(change) => setWhen(change.target.value)} className="h-11 rounded-xl border border-line bg-canvas px-3 text-[16px] font-normal outline-none focus:border-accent" />
      </label>
      <label className="mt-4 grid gap-1.5 text-[14px] font-semibold">
        {t.calendar.headline}
        <input
          required
          maxLength={HEADLINE_MAX}
          value={headline}
          onChange={(change) => setHeadline(change.target.value)}
          className="h-11 rounded-xl border border-line bg-canvas px-3 text-[16px] font-normal outline-none focus:border-accent"
        />
      </label>
      <label className="mt-4 grid gap-1.5 text-[14px] font-semibold">
        {t.calendar.text}
        <textarea
          required
          maxLength={LONG_TEXT_MAX}
          value={text}
          onChange={(change) => setText(change.target.value)}
          rows={5}
          className="rounded-xl border border-line bg-canvas px-3 py-2 text-[16px] font-normal outline-none focus:border-accent"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-4 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-auto flex gap-3 pt-8 pb-6">
        <Button type="submit" disabled={pending} className="flex-1">
          {t.calendar.save}
        </Button>
        {event ? (
          <Button type="button" variant="secondary" disabled={pending} className="flex-1 text-danger!" onClick={() => remove(event)}>
            {t.calendar.delete}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
