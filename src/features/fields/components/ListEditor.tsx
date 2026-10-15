'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { LIST_LABEL_MAX } from '@/lib/limits'
import { saveListAction, type ListItemInput, type SlotInput } from '../actions'
import type { Choice, ChoiceList, StatusChoice } from '../types'
import { ChoiceRows } from './ChoiceRows'

const SLOT_COUNT_MAX = 20
const control = 'h-11 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] text-ink outline-none focus:border-accent'

// One list (D2): rename, reorder, add, retire; one save for the whole list. Status rows also set
// their people (substatuses with a count); District lists belong to one country (countryId).
export function ListEditor({
  community,
  list,
  choices,
  substatuses = [],
  countryId = null,
}: {
  community: string
  list: ChoiceList
  choices: readonly (Choice | StatusChoice)[]
  substatuses?: readonly Choice[] // the Status list's people to pick from
  countryId?: string | null
}) {
  const [items, setItems] = useState<ListItemInput[]>(() =>
    choices.map((choice) => ({ id: choice.id, label: choice.label, active: choice.active, ...('slots' in choice ? { slots: choice.slots } : {}) })),
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="mx-auto grid max-w-xl grid-cols-1 gap-4 px-4 py-6 sm:px-8"
      onSubmit={(event) => {
        event.preventDefault()
        if (!event.currentTarget.reportValidity()) return
        setError(null)
        startTransition(async () => {
          const result = await saveListAction(community, list, items, countryId)
          if (result) setError(result.error)
        })
      }}
    >
      <p className="text-[15px] text-ink-soft">{t.builder.listHint[list]}</p>
      <ChoiceRows
        items={items}
        onChange={setItems}
        maxLength={LIST_LABEL_MAX}
        blank={() => (list === 'status' ? { id: null, label: '', active: true, slots: [] } : { id: null, label: '', active: true })}
        extra={list === 'status' ? (item, update) => <SlotEditor slots={item.slots ?? []} substatuses={substatuses} onChange={(slots) => update({ slots })} /> : undefined}
      />
      {error ? (
        <p role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="max-w-sm">
        {pending ? t.builder.saving : t.builder.save}
      </Button>
    </form>
  )
}

// A Status's people: "The Man × 1, The Woman × 1". None = one person, without a section of their own.
function SlotEditor({ slots, substatuses, onChange }: { slots: SlotInput[]; substatuses: readonly Choice[]; onChange: (slots: SlotInput[]) => void }) {
  const unused = substatuses.filter((item) => item.active && !slots.some((slot) => slot.substatusId === item.id))
  const name = (id: string) => substatuses.find((item) => item.id === id)?.label ?? ''

  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-semibold text-muted">{t.builder.people}</span>
      {slots.map((slot, index) => (
        <div key={slot.substatusId} className="flex items-center gap-2 text-[15px]">
          <span className="min-w-0 flex-1 truncate">{name(slot.substatusId)}</span>
          <label className="flex items-center gap-1.5 text-muted">
            ×
            <input
              type="number"
              min={1}
              max={SLOT_COUNT_MAX}
              value={slot.count}
              aria-label={t.builder.peopleCount(name(slot.substatusId))}
              onChange={(event) =>
                onChange(slots.map((item, i) => (i === index ? { ...item, count: Math.min(SLOT_COUNT_MAX, Math.max(1, Math.round(Number(event.target.value) || 1))) } : item)))
              }
              className={`${control} w-20 text-center`}
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(slots.filter((_, i) => i !== index))}
            aria-label={t.builder.remove(name(slot.substatusId))}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-hover"
          >
            <Icon name="trash" className="size-5" />
          </button>
        </div>
      ))}
      {unused.length > 0 ? (
        <select
          value=""
          aria-label={t.builder.addPerson}
          onChange={(event) => event.target.value && onChange([...slots, { substatusId: event.target.value, count: 1 }])}
          className={`${control} justify-self-start text-[15px]`}
        >
          <option value="">{t.builder.addPerson}</option>
          {unused.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}
      {slots.length === 0 ? <span className="text-[13px] text-muted">{t.builder.onePerson}</span> : null}
    </div>
  )
}
