'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'

const MAX_SCORE = 5

type Saved = { text: string; score: number }

// B5. Stored on the author's device only until the notes table exists; the key includes the author.
export function PrivateNotes({ storageKey, title }: { storageKey: string; title: string }) {
  const [text, setText] = useState('')
  const [score, setScore] = useState(0)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return
    const value = JSON.parse(raw) as Saved
    setText(value.text)
    setScore(value.score)
  }, [storageKey])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    window.localStorage.setItem(storageKey, JSON.stringify({ text, score } satisfies Saved))
    setSaved(true)
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto grid w-full max-w-2xl gap-6 px-5 py-6 sm:px-8">
      <div>
        <h2 className="text-[24px] leading-tight font-bold">{title}</h2>
        <p className="mt-1 text-[14px] text-muted">{t.notes.privacy}</p>
      </div>

      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.notes.label}
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setSaved(false)
          }}
          rows={8}
          className="resize-y rounded-xl border border-black/15 bg-canvas px-4 py-3 text-[16px] leading-relaxed font-normal outline-none hover:border-black/30 focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </label>

      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold">{t.notes.score}</legend>
        <div className="flex gap-1">
          {Array.from({ length: MAX_SCORE }, (_, index) => {
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
                className={`grid size-11 place-items-center rounded-xl hover:bg-black/5 ${score >= value ? 'text-accent' : 'text-black/15'}`}
              >
                <Icon name="starSolid" className="size-7" />
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <Button type="submit" className="max-w-40">
          {t.notes.save}
        </Button>
        {saved ? (
          <p role="status" className="text-[14px] font-semibold text-accent">
            ✓ {t.notes.saved}
          </p>
        ) : null}
      </div>
    </form>
  )
}
