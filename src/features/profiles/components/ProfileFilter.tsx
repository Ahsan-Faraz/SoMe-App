'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipSelect, FilterSection, NumberInput, NumberRange, filterInput } from '@/components/ui/FilterFields'
import { Icon } from '@/components/ui/Icon'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import { useGoBack } from '@/lib/history'
import { t } from '@/lib/i18n'
import { emptyFilter, readFilter, writeFilter, type ProfileFilter } from '../filter'
import { MAX_SCORE, MAX_STARS } from '../options'

// statuses / districts: the community's active lists (profile builder).
export function ProfileFilterForm({ community, returnHref, statuses, districts }: { community: string; returnHref: string; statuses: readonly string[]; districts: readonly string[] }) {
  const [filter, setFilter] = useState<ProfileFilter>(emptyFilter)
  const goBack = useGoBack(community)
  const set = <K extends keyof ProfileFilter>(name: K) => (value: ProfileFilter[K]) => setFilter((current) => ({ ...current, [name]: value }))

  // G1: edit freely here; the search runs once on Show (one query, not one per keystroke). Saved between sessions.
  useEffect(() => setFilter(readFilter(community)), [community])

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        writeFilter(community, filter)
        goBack(returnHref)
      }}
    >
      <div className={scrollArea}>
        <div className="mx-auto grid max-w-lg gap-6 px-4 py-6 sm:px-8">
          <FilterSection label={t.profiles.substring}>
            <span className="flex h-11 items-center gap-2 rounded-xl border border-line bg-canvas px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
              <Icon name="search" className="size-5 text-muted" />
              <input
                type="search"
                value={filter.text}
                onChange={(event) => set('text')(event.target.value)}
                placeholder={t.profiles.search}
                aria-label={t.profiles.substring}
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
              />
            </span>
          </FilterSection>
          <FilterSection label={t.profiles.status}>
            <ChipSelect options={statuses} value={filter.picked} onChange={set('picked')} />
          </FilterSection>
          <FilterSection label={t.profiles.lookingFor}>
            <ChipSelect options={statuses} value={filter.lookingFor} onChange={set('lookingFor')} />
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
          <FilterSection label={t.profiles.district}>
            <MultiSelect label={t.profiles.district} options={districts} value={filter.districts} onChange={set('districts')} placeholder={t.profiles.choose} showLabel={false} />
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
          <button type="button" onClick={() => setFilter(emptyFilter)} className="text-[15px] font-semibold text-accent">
            {t.profiles.clear}
          </button>
          <Button type="submit" className="flex-1">
            {t.profiles.show}
          </Button>
        </div>
      </div>
    </form>
  )
}
