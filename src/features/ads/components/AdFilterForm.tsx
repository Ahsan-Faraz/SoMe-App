'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipSelect, FilterSection, NumberInput, NumberRange, filterInput } from '@/components/ui/FilterFields'
import { Icon } from '@/components/ui/Icon'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import type { Builtins, Choice } from '@/features/fields/types'
import { MAX_SCORE, MAX_STARS } from '@/features/profiles/options'
import { useGoBack } from '@/lib/history'
import { t } from '@/lib/i18n'
import { FILTER_TEXT_MAX } from '@/lib/limits'
import { createClient } from '@/lib/supabase/browser'
import { toSavedAdFilter } from '../filter'
import { emptyAdFilter, type AdFilter } from '../types'

// count: how many filters the saved one sets (the server read it with the first page).
export function AdsFilterButton({ community, count }: { community: string; count: number }) {
  return (
    <Link href={`/${community}/ads/filter`} aria-label={t.ads.filter} className="relative inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover">
      <Icon name="filter" />
      {count > 0 ? <span className="absolute top-1 right-1 grid size-4.5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">{count}</span> : null}
    </Link>
  )
}

// statuses / districts: the community's active lists (profile builder). builtins: age and score
// filters only while the community shows them (search_ads ignores them otherwise).
export function AdFilterForm({
  community,
  communityId,
  saved,
  statuses,
  districts,
  builtins,
}: {
  community: string
  communityId: string
  saved: AdFilter
  statuses: readonly Choice[]
  districts: readonly Choice[]
  builtins: Builtins
}) {
  const [filter, setFilter] = useState<AdFilter>(saved)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const goBack = useGoBack(community)
  const set = <K extends keyof AdFilter>(name: K) => (value: AdFilter[K]) => setFilter((current) => ({ ...current, [name]: value }))
  const names = Object.fromEntries(statuses.map((choice) => [choice.id, choice.label]))
  const name = (id: string) => names[id] ?? ''
  const statusIds = statuses.map((choice) => choice.id)

  // D1: edit freely here; the search runs once on Show. Saved on the account (save_ad_filter), so it
  // is the same on every device.
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        startTransition(async () => {
          const { error } = await createClient().rpc('save_ad_filter', { p_community: communityId, p_filter: toSavedAdFilter(filter) })
          if (error) setError(t.common.error)
          else goBack(`/${community}/ads`)
        })
      }}
    >
      <div className={scrollArea}>
        <div className="mx-auto grid max-w-lg gap-6 px-4 py-6 sm:px-8">
          <FilterSection label={t.profiles.substring}>
            <input value={filter.text} onChange={(event) => set('text')(event.target.value)} aria-label={t.profiles.substring} maxLength={FILTER_TEXT_MAX} className={filterInput} />
          </FilterSection>
          <FilterSection label={t.profiles.status}>
            <ChipSelect options={statusIds} value={filter.statuses} onChange={set('statuses')} format={name} />
          </FilterSection>
          {builtins.age ? (
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
          ) : null}
          <FilterSection label={t.ads.lookingFor}>
            <ChipSelect options={statusIds} value={filter.lookingFor} onChange={set('lookingFor')} format={name} />
          </FilterSection>
          <FilterSection label={t.profiles.district}>
            <select value={filter.district} onChange={(event) => set('district')(event.target.value)} aria-label={t.profiles.district} className={filterInput}>
              <option value=""> </option>
              {districts.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </FilterSection>
          <FilterSection label={t.profiles.place}>
            <input value={filter.place} onChange={(event) => set('place')(event.target.value)} aria-label={t.profiles.place} maxLength={FILTER_TEXT_MAX} className={filterInput} />
          </FilterSection>
          {builtins.score ? (
            <FilterSection label={t.profiles.scoreMin(MAX_SCORE)}>
              <NumberInput value={filter.minScore} onChange={set('minScore')} placeholder={t.profiles.min} label={t.profiles.scoreMin(MAX_SCORE)} max={MAX_SCORE} />
            </FilterSection>
          ) : null}
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
          {error ? (
            <p role="alert" className="text-[15px] font-semibold text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <div className={bottomBar}>
        <div className="mx-auto flex max-w-lg items-center gap-4">
          <button type="button" onClick={() => setFilter(emptyAdFilter)} className="text-[15px] font-semibold text-accent">
            {t.profiles.clear}
          </button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {t.ads.show}
          </Button>
        </div>
      </div>
    </form>
  )
}
