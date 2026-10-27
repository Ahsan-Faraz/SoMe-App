'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipSelect, FilterSection, NumberInput, NumberRange, filterInput } from '@/components/ui/FilterFields'
import { Icon } from '@/components/ui/Icon'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import { useGoBack } from '@/lib/history'
import { t } from '@/lib/i18n'
import { FILTER_TEXT_MAX } from '@/lib/limits'
import { createClient } from '@/lib/supabase/browser'
import type { Builtins, Choice, FieldDef } from '@/features/fields/types'
import { emptyFilter, toSaved, type FieldFilter, type ProfileFilter } from '../filter'
import { MAX_SCORE, MAX_STARS } from '../options'

// The largest number a number field filter takes (digits only, no limit when empty).
const FIELD_NUMBER_MAX = 999_999_999

// statuses / districts: the community's active lists (profile builder). builtins: the basic fields it
// shows; filters for the others are left out. fields: the builder fields the admin made searchable.
export function ProfileFilterForm({
  community,
  communityId,
  returnHref,
  saved,
  statuses,
  districts,
  builtins,
  fields,
}: {
  community: string
  communityId: string
  returnHref: string
  saved: ProfileFilter
  statuses: readonly Choice[]
  districts: readonly Choice[]
  builtins: Builtins
  fields: readonly FieldDef[]
}) {
  const [filter, setFilter] = useState<ProfileFilter>(saved)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const goBack = useGoBack(community)
  const set = <K extends keyof ProfileFilter>(name: K) => (value: ProfileFilter[K]) => setFilter((current) => ({ ...current, [name]: value }))
  const setField = (id: string, cond: FieldFilter) => setFilter((current) => ({ ...current, fields: { ...current.fields, [id]: cond } }))
  const names = Object.fromEntries([...statuses, ...districts].map((choice) => [choice.id, choice.label]))
  const name = (id: string) => names[id] ?? ''
  const statusIds = statuses.map((choice) => choice.id)

  // G1: edit freely here; the search runs once on Show (one query, not one per keystroke). The filter
  // is saved on the account (save_search_filter), so it is the same on every device.
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        startTransition(async () => {
          const { error } = await createClient().rpc('save_search_filter', { p_community: communityId, p_filter: toSaved(filter) })
          if (error) setError(t.common.error)
          else goBack(returnHref)
        })
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
                maxLength={FILTER_TEXT_MAX}
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
              />
            </span>
          </FilterSection>
          <FilterSection label={t.profiles.status}>
            <ChipSelect options={statusIds} value={filter.statuses} onChange={set('statuses')} format={name} />
          </FilterSection>
          {builtins.lookingFor ? (
            <FilterSection label={t.profiles.lookingFor}>
              <ChipSelect options={statusIds} value={filter.lookingFor} onChange={set('lookingFor')} format={name} />
            </FilterSection>
          ) : null}
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
          {builtins.district ? (
            <FilterSection label={t.profiles.district}>
              <MultiSelect
                label={t.profiles.district}
                options={districts.map((choice) => choice.id)}
                value={filter.districts}
                onChange={set('districts')}
                format={name}
                placeholder={t.profiles.choose}
                showLabel={false}
              />
            </FilterSection>
          ) : null}
          {builtins.place ? (
            <FilterSection label={t.profiles.place}>
              <input value={filter.place} onChange={(event) => set('place')(event.target.value)} aria-label={t.profiles.place} maxLength={FILTER_TEXT_MAX} className={filterInput} />
            </FilterSection>
          ) : null}
          {builtins.score ? (
            <FilterSection label={t.profiles.scoreMin(MAX_SCORE)}>
              <NumberInput value={filter.minScore} onChange={set('minScore')} placeholder={t.profiles.min} label={t.profiles.scoreMin(MAX_SCORE)} max={MAX_SCORE} />
            </FilterSection>
          ) : null}
          {fields.map((field) => (
            <FilterSection key={field.id} label={field.label}>
              <FieldFilterInput field={field} value={filter.fields[field.id] ?? {}} onChange={(cond) => setField(field.id, cond)} />
            </FilterSection>
          ))}
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
        {error ? (
          <p role="alert" className="mx-auto mb-2 max-w-lg text-[14px] text-danger">
            {error}
          </p>
        ) : null}
        <div className="mx-auto flex max-w-lg items-center gap-4">
          <button type="button" onClick={() => setFilter(emptyFilter)} className="text-[15px] font-semibold text-accent">
            {t.profiles.clear}
          </button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {t.profiles.show}
          </Button>
        </div>
      </div>
    </form>
  )
}

// One searchable builder field, by its kind: text contains, yes or no, any of the choices, a range.
function FieldFilterInput({ field, value, onChange }: { field: FieldDef; value: FieldFilter; onChange: (value: FieldFilter) => void }) {
  switch (field.kind) {
    case 'short_text':
    case 'long_text':
      return <input value={value.text ?? ''} onChange={(event) => onChange({ text: event.target.value })} aria-label={field.label} maxLength={FILTER_TEXT_MAX} className={filterInput} />
    case 'yes_no': {
      const picked = value.yes === undefined ? [] : [value.yes ? 'yes' : 'no']
      return (
        <ChipSelect
          options={['yes', 'no']}
          value={picked}
          // One answer at a time: tapping the other one switches, tapping the same one clears.
          onChange={(next) => {
            const added = next.find((item) => !picked.includes(item))
            onChange(added ? { yes: added === 'yes' } : {})
          }}
          format={(option) => (option === 'yes' ? t.profiles.yes : t.profiles.no)}
        />
      )
    }
    case 'pick_one':
    case 'pick_several': {
      const choices = field.choices.filter((choice) => choice.active)
      const labels = Object.fromEntries(choices.map((choice) => [choice.id, choice.label]))
      return (
        <ChipSelect options={choices.map((choice) => choice.id)} value={value.options ?? []} onChange={(options) => onChange({ options })} format={(id) => labels[id] ?? ''} />
      )
    }
    case 'number':
      return (
        <NumberRange
          label={field.label}
          from={value.min ?? ''}
          to={value.max ?? ''}
          onFrom={(min) => onChange({ ...value, min })}
          onTo={(max) => onChange({ ...value, max })}
          fromLabel={t.profiles.min}
          toLabel={t.profiles.max}
          max={FIELD_NUMBER_MAX}
        />
      )
    case 'date':
      return (
        <div className="flex items-center gap-2">
          <input type="date" value={value.from ?? ''} onChange={(event) => onChange({ ...value, from: event.target.value })} aria-label={`${field.label} ${t.profiles.ageFrom.toLowerCase()}`} className={filterInput} />
          <span aria-hidden className="text-muted">
            –
          </span>
          <input type="date" value={value.to ?? ''} onChange={(event) => onChange({ ...value, to: event.target.value })} aria-label={`${field.label} ${t.profiles.ageTo.toLowerCase()}`} className={filterInput} />
        </div>
      )
    default:
      return null
  }
}
