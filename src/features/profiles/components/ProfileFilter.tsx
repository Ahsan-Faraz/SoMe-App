'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { emptyFilter, readFilter, writeFilter, type ProfileFilter } from '../filter'

const statuses = ['Man', 'Woman']

export function ProfileFilterForm({ community }: { community: string }) {
  const [filter, setFilter] = useState<ProfileFilter>(emptyFilter)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setFilter(readFilter(community))
    setReady(true)
  }, [community])

  useEffect(() => {
    if (ready) writeFilter(community, filter)
  }, [ready, community, filter])

  return (
    <form className="mx-auto grid max-w-lg gap-6 px-4 py-6 sm:px-8" onSubmit={(event) => event.preventDefault()}>
      <label className="grid gap-2">
        <span className="text-[13px] font-bold uppercase tracking-wide text-muted">{t.profiles.substring}</span>
        <span className="flex h-11 items-center gap-2 rounded-xl border border-line bg-canvas px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          <Icon name="search" className="size-5 text-muted" />
          <input
            type="search"
            value={filter.text}
            onChange={(event) => setFilter({ ...filter, text: event.target.value })}
            placeholder={t.profiles.search}
            aria-label={t.profiles.substring}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
          />
        </span>
      </label>
      <fieldset>
        <legend className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted">{t.profiles.status}</legend>
        <div className="flex gap-2">
          {statuses.map((status) => {
            const on = filter.picked.includes(status)
            return (
              <button
                key={status}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter({ ...filter, picked: on ? filter.picked.filter((item) => item !== status) : [...filter.picked, status] })}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold ${on ? 'border-accent bg-accent text-white' : 'border-line bg-canvas text-ink'}`}
              >
                {on ? <Icon name="check" className="size-4" /> : null}
                {status}
              </button>
            )
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted">{t.profiles.age}</legend>
        <div className="flex items-center gap-2">
          <AgeInput label={t.profiles.ageFrom} value={filter.minAge} onChange={(minAge) => setFilter({ ...filter, minAge })} />
          <span aria-hidden className="text-muted">–</span>
          <AgeInput label={t.profiles.ageTo} value={filter.maxAge} onChange={(maxAge) => setFilter({ ...filter, maxAge })} />
        </div>
      </fieldset>
      <button type="button" onClick={() => setFilter(emptyFilter)} className="justify-self-start text-[15px] font-semibold text-accent">
        {t.profiles.clear}
      </button>
    </form>
  )
}

function AgeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <input
      inputMode="numeric"
      maxLength={3}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
      placeholder={label}
      aria-label={`${t.profiles.age} ${label.toLowerCase()}`}
      className="h-11 w-24 rounded-xl border border-line bg-canvas px-3 text-center text-[16px] outline-none placeholder:text-muted focus:border-accent"
    />
  )
}
