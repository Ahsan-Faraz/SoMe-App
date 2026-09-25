'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { Avatar } from '@/components/ui/Avatar'
import { t } from '@/lib/i18n'
import type { ProfileCard } from '../types'

const statuses = ['Man', 'Woman']

export function ProfileList({ community, profiles }: { community: string; profiles: ProfileCard[] }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const query = useDeferredValue(text.trim().toLowerCase())

  const visible = useMemo(() => {
    const min = minAge === '' ? null : Number(minAge)
    const max = maxAge === '' ? null : Number(maxAge)
    return profiles.filter((profile) => {
      if (picked.length > 0 && !picked.includes(profile.status)) return false
      if (min !== null && profile.age < min) return false
      if (max !== null && profile.age > max) return false
      if (!query) return true
      return `${profile.username} ${profile.headline} ${profile.district}`.toLowerCase().includes(query)
    })
  }, [profiles, picked, minAge, maxAge, query])

  const active = picked.length + (minAge ? 1 : 0) + (maxAge ? 1 : 0) + (text ? 1 : 0)
  const clear = () => {
    setText('')
    setPicked([])
    setMinAge('')
    setMaxAge('')
  }

  return (
    <>
      <ScreenHeader
        title={t.profiles.title}
        right={
          <button
            type="button"
            aria-expanded={open}
            aria-label={t.profiles.filter}
            onClick={() => setOpen((value) => !value)}
            className={`relative inline-flex size-11 items-center justify-center rounded-full ${open ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-black/5'}`}
          >
            <Icon name="filter" />
            {active > 0 ? (
              <span className="absolute right-1 top-1 grid size-4.5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">{active}</span>
            ) : null}
          </button>
        }
      />
      {open ? (
        <form
          className="flex flex-wrap items-end gap-x-6 gap-y-4 border-b border-line bg-sunken px-4 py-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="flex h-11 w-full items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-ink focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 min-[52rem]:w-auto min-[52rem]:min-w-72 min-[52rem]:flex-1">
            <Icon name="search" className="size-5 text-muted" />
            <input
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t.profiles.search}
              aria-label={t.profiles.search}
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted">{t.profiles.status}</legend>
            <div className="flex gap-2">
              {statuses.map((status) => {
                const on = picked.includes(status)
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((current) => (on ? current.filter((item) => item !== status) : [...current, status]))}
                    className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold ${
                      on ? 'border-accent bg-accent text-white' : 'border-line bg-canvas text-ink hover:border-accent/50'
                    }`}
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
              <AgeInput label={t.profiles.ageFrom} value={minAge} onChange={setMinAge} />
              <span aria-hidden className="text-muted">–</span>
              <AgeInput label={t.profiles.ageTo} value={maxAge} onChange={setMaxAge} />
            </div>
          </fieldset>
          <div className="ml-auto flex h-10 items-center gap-4">
            <span className="text-[14px] font-semibold text-ink-soft" aria-live="polite">
              {t.profiles.results(visible.length)}
            </span>
            {active > 0 ? (
              <button type="button" onClick={clear} className="text-[15px] font-semibold text-accent hover:underline">
                {t.profiles.clear}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
      {visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-muted">{t.profiles.empty}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] p-2">
          {visible.map((profile) => (
            <li key={profile.id} className="[contain-intrinsic-size:auto_140px] [content-visibility:auto]">
              <Link href={`/${community}/profiles/${profile.id}`} className="m-2 flex gap-3 rounded-2xl border border-black/10 p-4 hover:border-accent/40 hover:bg-accent/[0.03]">
                <Avatar name={profile.username} seed={profile.id} />
                <span className="min-w-0 flex-1 text-[14px]">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[16px] font-bold">{profile.username}</span>
                    <span className="shrink-0 rounded-full bg-rail px-2 py-0.5 text-[12px] font-semibold">{profile.status}</span>
                  </span>
                  <span className="mt-1 block text-ink-soft">{profile.age}</span>
                  <span className="block text-ink-soft">{profile.district}</span>
                  <span className="block text-ink-soft">{profile.place}</span>
                  <span className="mt-1 block truncate font-semibold text-ink">{profile.headline}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
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
      className="h-10 w-20 rounded-xl border border-line bg-canvas px-3 text-center text-[16px] outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
    />
  )
}
