'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { FIELD_TEXT_MAX, STARS_MAX } from '@/lib/limits'
import { createClient } from '@/lib/supabase/browser'
import type { Note } from '../types'

// B5: my private note and stars about a member, saved to the notes table (set_note). Only the author
// can ever read it, not even an admin. Seeded from the saved note: the page keys this form by it.
export function PrivateNotes({ communityId, subjectId, note }: { communityId: string; subjectId: string; note: Note }) {
  const [text, setText] = useState(note.body)
  const [score, setScore] = useState(note.stars)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const shown = useRef(false)

  // Pages stay alive between visits: shown again (after swipe rated this person, say), reload. A
  // newer saved note reseeds the form; one that hasn't changed leaves what you typed.
  useEffect(() => {
    if (shown.current) router.refresh()
    shown.current = true
  }, [router])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      // No text and no stars deletes the note.
      const { error } = await createClient().rpc('set_note', { p_community: communityId, p_subject: subjectId, p_note: { body: text, stars: score || null } })
      if (error) setError(t.common.error)
      else setSaved(true)
    })
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto grid w-full max-w-2xl gap-6 px-5 py-6 sm:px-8">
      <p className="text-[14px] text-muted">{t.notes.privacy}</p>

      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.notes.label}
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setSaved(false)
          }}
          rows={8}
          maxLength={FIELD_TEXT_MAX}
          className="resize-y rounded-xl border border-line-strong bg-canvas px-4 py-3 text-[16px] leading-relaxed font-normal outline-none hover:border-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </label>

      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold">{t.notes.score}</legend>
        <div className="flex gap-1">
          {Array.from({ length: STARS_MAX }, (_, index) => {
            const value = index + 1
            return (
              <button
                key={value}
                type="button"
                aria-label={t.notes.rate(value)}
                aria-pressed={score >= value}
                onClick={() => {
                  setScore(score === value ? 0 : value)
                  setSaved(false)
                }}
                className={`grid size-11 place-items-center rounded-xl hover:bg-hover ${score >= value ? 'text-accent' : 'text-line-strong'}`}
              >
                <Icon name="starSolid" className="size-7" />
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <Button type="submit" className="max-w-40" disabled={pending}>
          {t.notes.save}
        </Button>
        {saved ? (
          <p role="status" className="text-[14px] font-semibold text-accent">
            ✓ {t.notes.saved}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[14px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  )
}
