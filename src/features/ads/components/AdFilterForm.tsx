'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { adFilterCount, readAdFilter, watchAdFilter, writeAdFilter } from '../storage'
import { emptyAdFilter, type AdFilter } from '../types'

const statuses = ['Man', 'Woman']
const looking = ['Man', 'Woman', 'Couple', 'Other']
const districts = ['Stockholm', 'Södermalm', 'Nacka', 'Solna', 'Årsta']

export function AdsFilterButton({ community }: { community: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => watchAdFilter(community, (filter) => setCount(adFilterCount(filter))), [community])

  return (
    <Link href={`/${community}/ads/filter`} aria-label={t.ads.filter} className="relative inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover">
      <Icon name="filter" />
      {count > 0 ? <span className="absolute right-1 top-1 grid size-4.5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">{count}</span> : null}
    </Link>
  )
}

export function AdFilterForm({ community }: { community: string }) {
  const [filter, setFilter] = useState<AdFilter>(emptyAdFilter)
  const router = useRouter()

  // D1: edit freely here; the search runs once on Show. Saved between sessions.
  useEffect(() => setFilter(readAdFilter(community)), [community])

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        writeAdFilter(community, filter)
        router.push(`/${community}/ads`)
      }}
    >
      <div className={scrollArea}>
        <div className="mx-auto grid max-w-lg gap-5 px-4 py-6 sm:px-8">
          <Field label={t.profiles.substring}>
            <input value={filter.text} onChange={(event) => setFilter({ ...filter, text: event.target.value })} className={input} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted">{t.profiles.status}</legend>
            <div className="flex gap-2">
              {statuses.map((status) => {
                const on = filter.statuses.includes(status)
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter({ ...filter, statuses: on ? filter.statuses.filter((item) => item !== status) : [...filter.statuses, status] })}
                    className={`h-10 rounded-full border px-4 text-[15px] font-semibold ${on ? 'border-accent bg-accent text-white' : 'border-line'}`}
                  >
                    {status}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <Field label={t.profiles.age}>
            <span className="flex items-center gap-2">
              <input
                inputMode="numeric"
                value={filter.minAge}
                placeholder={t.profiles.ageFrom}
                aria-label={t.profiles.ageFrom}
                onChange={(event) => setFilter({ ...filter, minAge: event.target.value.replace(/\D/g, '') })}
                className={`${input} w-24 text-center`}
              />
              <span className="text-muted">–</span>
              <input
                inputMode="numeric"
                value={filter.maxAge}
                placeholder={t.profiles.ageTo}
                aria-label={t.profiles.ageTo}
                onChange={(event) => setFilter({ ...filter, maxAge: event.target.value.replace(/\D/g, '') })}
                className={`${input} w-24 text-center`}
              />
            </span>
          </Field>
          <Field label={t.ads.lookingFor}>
            <select value={filter.lookingFor} onChange={(event) => setFilter({ ...filter, lookingFor: event.target.value })} className={input}>
              <option value=""> </option>
              {looking.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label={t.profiles.district}>
            <select value={filter.district} onChange={(event) => setFilter({ ...filter, district: event.target.value })} className={input}>
              <option value=""> </option>
              {districts.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label={t.profiles.place}>
            <input value={filter.place} onChange={(event) => setFilter({ ...filter, place: event.target.value })} className={input} />
          </Field>
        </div>
      </div>
      <div className={bottomBar}>
        <div className="mx-auto flex max-w-lg items-center gap-4">
          <button type="button" onClick={() => setFilter(emptyAdFilter)} className="text-[15px] font-semibold text-accent">
            {t.profiles.clear}
          </button>
          <Button type="submit" className="flex-1">
            {t.ads.show}
          </Button>
        </div>
      </div>
    </form>
  )
}

const input = 'h-11 w-full rounded-xl border border-line bg-canvas px-3 text-[16px] font-normal outline-none focus:border-accent'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-[13px] font-bold uppercase tracking-wide text-muted">
      {label}
      {children}
    </label>
  )
}
