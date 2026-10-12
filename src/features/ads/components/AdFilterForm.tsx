'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipSelect, FilterSection, NumberInput, NumberRange, filterInput } from '@/components/ui/FilterFields'
import { Icon } from '@/components/ui/Icon'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import { MAX_SCORE, MAX_STARS } from '@/features/profiles/options'
import { useGoBack } from '@/lib/history'
import { t } from '@/lib/i18n'
import { adFilterCount, readAdFilter, watchAdFilter, writeAdFilter } from '../storage'
import { emptyAdFilter, type AdFilter } from '../types'

export function AdsFilterButton({ community }: { community: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => watchAdFilter(community, (filter) => setCount(adFilterCount(filter))), [community])

  return (
    <Link href={`/${community}/ads/filter`} aria-label={t.ads.filter} className="relative inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover">
      <Icon name="filter" />
      {count > 0 ? <span className="absolute top-1 right-1 grid size-4.5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">{count}</span> : null}
    </Link>
  )
}

// statuses / districts: the community's active lists (profile builder).
export function AdFilterForm({ community, statuses, districts }: { community: string; statuses: readonly string[]; districts: readonly string[] }) {
  const [filter, setFilter] = useState<AdFilter>(emptyAdFilter)
  const goBack = useGoBack(community)
  const set = <K extends keyof AdFilter>(name: K) => (value: AdFilter[K]) => setFilter((current) => ({ ...current, [name]: value }))

  // D1: edit freely here; the search runs once on Show. Saved between sessions.
  useEffect(() => setFilter(readAdFilter(community)), [community])

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        writeAdFilter(community, filter)
        goBack(`/${community}/ads`)
      }}
    >
      <div className={scrollArea}>
        <div className="mx-auto grid max-w-lg gap-6 px-4 py-6 sm:px-8">
          <FilterSection label={t.profiles.substring}>
            <input value={filter.text} onChange={(event) => set('text')(event.target.value)} aria-label={t.profiles.substring} className={filterInput} />
          </FilterSection>
          <FilterSection label={t.profiles.status}>
            <ChipSelect options={statuses} value={filter.statuses} onChange={set('statuses')} />
          </FilterSection>
          <FilterSection label={t.profiles.age}>
            <NumberRange
              label={t.profiles.age}
              from={filter.minAge}
              to={filter.maxAge}
              onFrom={set('minAge')}
              onTo={set('maxAge')}
              fromLabel={t.profiles.ageFrom}
              toLabel={t.profiles.ageTo}
              max={120}
            />
          </FilterSection>
          <FilterSection label={t.ads.lookingFor}>
            <ChipSelect options={statuses} value={filter.lookingFor} onChange={set('lookingFor')} />
          </FilterSection>
          <FilterSection label={t.profiles.district}>
            <select value={filter.district} onChange={(event) => set('district')(event.target.value)} aria-label={t.profiles.district} className={filterInput}>
              <option value=""> </option>
              {districts.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </FilterSection>
          <FilterSection label={t.profiles.place}>
            <input value={filter.place} onChange={(event) => set('place')(event.target.value)} aria-label={t.profiles.place} className={filterInput} />
          </FilterSection>
          <FilterSection label={t.profiles.scoreMin(MAX_SCORE)}>
            <NumberInput value={filter.minScore} onChange={set('minScore')} placeholder={t.profiles.min} label={t.profiles.scoreMin(MAX_SCORE)} max={MAX_SCORE} />
          </FilterSection>
          <FilterSection label={t.profiles.starsRange(MAX_STARS)}>
            <NumberRange
              label={t.profiles.stars}
              from={filter.minStars}
              to={filter.maxStars}
              onFrom={set('minStars')}
              onTo={set('maxStars')}
              fromLabel={t.profiles.min}
              toLabel={t.profiles.max}
              max={MAX_STARS}
            />
          </FilterSection>
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
