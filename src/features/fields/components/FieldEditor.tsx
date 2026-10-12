'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { FIELD_LABEL_MAX } from '@/lib/limits'
import { saveFieldAction, type FieldInput } from '../actions'
import { FIELD_KINDS, type FieldDef, type FieldKind, type StatusChoice } from '../types'
import { ChoiceRows } from './ChoiceRows'

const control = 'h-11 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] font-normal text-ink outline-none focus:border-accent'
const label = 'grid gap-1.5 text-[14px] font-semibold text-ink'
const hint = 'text-[13px] font-normal text-muted'
const isPick = (kind: FieldKind) => kind === 'pick_one' || kind === 'pick_several'

const blank: FieldInput = {
  id: null,
  label: '',
  kind: 'short_text',
  required: false,
  searchable: false,
  onCard: false,
  perPerson: false,
  statuses: null,
  maxLength: null,
  active: true,
  choices: [],
}

// Add or edit one profile field: name, type (new fields only), choices, flags and which Statuses see it.
export function FieldEditor({ community, field, statuses }: { community: string; field: FieldDef | null; statuses: readonly StatusChoice[] }) {
  const [values, setValues] = useState<FieldInput>(() =>
    field
      ? {
          id: field.id,
          label: field.label,
          kind: field.kind,
          required: field.required,
          searchable: field.searchable,
          onCard: field.onCard,
          perPerson: field.perPerson,
          statuses: field.statuses,
          maxLength: field.maxLength,
          active: field.active,
          choices: field.choices.map(({ id, label: name, active }) => ({ id, label: name, active, people: 1 })),
        }
      : blank,
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const set = <K extends keyof FieldInput>(key: K, value: FieldInput[K]) => setValues((current) => ({ ...current, [key]: value }))

  const picked = values.statuses ?? []
  // Retired Statuses stay listed only while this field still uses them.
  const shownStatuses = statuses.filter((status) => status.active || picked.includes(status.id))
  const toggleStatus = (id: string, on: boolean) => {
    const next = on ? [...picked, id] : picked.filter((item) => item !== id)
    set('statuses', next.length > 0 ? next : null)
  }

  const flags: [keyof Pick<FieldInput, 'required' | 'searchable' | 'onCard' | 'perPerson'>, string, string][] = [
    ['required', t.builder.required, t.builder.requiredHint],
    ['searchable', t.builder.searchable, t.builder.searchableHint],
    ['onCard', t.builder.onCard, t.builder.onCardHint],
    ['perPerson', t.builder.perPerson, t.builder.perPersonHint],
  ]

  return (
    <form
      className="mx-auto grid max-w-xl grid-cols-1 gap-5 px-4 py-6 sm:px-8"
      onSubmit={(event) => {
        event.preventDefault()
        if (!event.currentTarget.reportValidity()) return
        setError(null)
        startTransition(async () => {
          const result = await saveFieldAction(community, values)
          if (result) setError(result.error)
        })
      }}
    >
      <label className={label}>
        {t.builder.name}
        <input value={values.label} onChange={(event) => set('label', event.target.value)} required maxLength={FIELD_LABEL_MAX} className={control} />
      </label>

      {field ? (
        <div className={label}>
          <span>{t.builder.kind}</span>
          <p className="text-[16px] font-normal">{t.builder.kinds[field.kind]}</p>
          <span className={hint}>{t.builder.kindLocked}</span>
        </div>
      ) : (
        <label className={label}>
          {t.builder.kind}
          <select
            value={values.kind}
            onChange={(event) => {
              const kind = FIELD_KINDS.find((item) => item === event.target.value) ?? 'short_text'
              setValues((current) => ({
                ...current,
                kind,
                searchable: kind === 'photo' ? false : current.searchable,
                choices: isPick(kind) && current.choices.length === 0 ? [{ id: null, label: '', active: true, people: 1 }] : current.choices,
              }))
            }}
            className={control}
          >
            {FIELD_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t.builder.kinds[kind]}
              </option>
            ))}
          </select>
        </label>
      )}

      {isPick(values.kind) ? (
        <fieldset className="grid grid-cols-1 gap-2">
          <legend className="mb-1.5 text-[14px] font-semibold">{t.builder.choices}</legend>
          <ChoiceRows items={values.choices} onChange={(choices) => set('choices', choices)} maxLength={FIELD_LABEL_MAX} />
        </fieldset>
      ) : null}

      <fieldset className="grid grid-cols-1 gap-3 rounded-2xl bg-sunken p-4">
        {flags
          .filter(([key]) => key !== 'searchable' || values.kind !== 'photo')
          .map(([key, name, detail]) => (
            <label key={key} className="flex items-start gap-3 text-[16px] font-medium">
              <input type="checkbox" checked={values[key]} onChange={(event) => set(key, event.target.checked)} className="mt-1" />
              <span className="grid">
                {name}
                <span className={hint}>{detail}</span>
              </span>
            </label>
          ))}
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-2">
        <legend className="mb-1.5 text-[14px] font-semibold">{t.builder.forStatuses}</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {shownStatuses.map((status) => (
            <label key={status.id} className={`flex items-center gap-2.5 text-[16px] ${status.active ? '' : 'text-muted'}`}>
              <input type="checkbox" checked={picked.includes(status.id)} onChange={(event) => toggleStatus(status.id, event.target.checked)} />
              {status.label}
            </label>
          ))}
        </div>
        <span className={hint}>{values.statuses ? t.builder.forStatusesHint : `${t.builder.everyStatus}. ${t.builder.forStatusesHint}`}</span>
      </fieldset>

      {field ? (
        <label className="flex items-start gap-3 rounded-2xl border border-line p-4 text-[16px] font-medium">
          <input type="checkbox" checked={!values.active} onChange={(event) => set('active', !event.target.checked)} className="mt-1" />
          <span className="grid">
            {t.builder.retireField}
            <span className={hint}>{t.builder.retireHint}</span>
          </span>
        </label>
      ) : null}

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
