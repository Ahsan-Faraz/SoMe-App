'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { t } from '@/lib/i18n'
import { saveBuiltinsAction } from '../actions'
import { BUILTINS, type Builtin, type Builtins } from '../types'

// The basic fields this community's profiles show. Each switch saves at once and moves first;
// it goes back on its own if the save fails.
export function BuiltinsForm({ community, builtins }: { community: string; builtins: Builtins }) {
  const [shown, setShown] = useOptimistic(builtins)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const toggle = (key: Builtin, on: boolean) => {
    const next = { ...shown, [key]: on }
    setError(null)
    startTransition(async () => {
      setShown(next)
      const result = await saveBuiltinsAction(community, next)
      if (result) setError(result.error)
    })
  }

  return (
    <section className="grid grid-cols-1 gap-3">
      <h2 className="text-[13px] font-bold tracking-wide text-muted uppercase">{t.builder.basics}</h2>
      <p className="text-[14px] text-ink-soft">{t.builder.basicsHint}</p>
      <div className="grid grid-cols-1 gap-2 rounded-2xl bg-sunken p-4">
        {BUILTINS.map((key) => (
          <label key={key} className="flex items-start gap-3 text-[16px]">
            <input type="checkbox" checked={shown[key]} onChange={(event) => toggle(key, event.target.checked)} className="mt-1" />
            {t.builder.builtins[key]}
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  )
}
