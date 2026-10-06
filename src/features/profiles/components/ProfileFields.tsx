'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { GrowingTextarea } from '@/components/ui/GrowingTextarea'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { t } from '@/lib/i18n'
import { displayValue, fieldsFor, seedValues, type FieldDef, type FieldValue } from '../fields'
import { STATUSES } from '../options'

type Draft = { status: string; lookingFor: string[]; visible: boolean; values: Record<string, FieldValue> }

const control = 'rounded-xl border border-line-strong bg-canvas px-3 text-[16px] font-normal text-ink outline-none focus:border-accent'
const label = 'grid gap-1.5 text-[14px] font-semibold text-ink'

// A3/B1 body. Status sits at the top because it decides which fields the profile has.
// `media` (photos + facts) is server-rendered and slotted in between, so it stays out of the client bundle.
export function ProfileFields({
  storageKey,
  own,
  status,
  lookingFor,
  about,
  headline,
  media,
}: {
  storageKey: string
  own: boolean
  status: string
  lookingFor: string[]
  about: string
  headline: string
  media: ReactNode
}) {
  const [draft, setDraft] = useState<Draft>(() => ({ status, lookingFor, visible: true, values: seedValues(about, headline) }))
  const [ready, setReady] = useState(false)
  const fields = fieldsFor(draft.status)

  // Own profile only: keep edits on this device until the profile table is wired.
  useEffect(() => {
    if (!own) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Draft> | null
      if (saved) setDraft((current) => ({ ...current, ...saved, values: { ...current.values, ...saved.values } }))
    } catch {
      // Unreadable draft: keep the server values.
    }
    setReady(true)
  }, [own, storageKey])

  useEffect(() => {
    if (ready) localStorage.setItem(storageKey, JSON.stringify(draft))
  }, [ready, storageKey, draft])

  const setValue = (id: string, value: FieldValue) => setDraft((current) => ({ ...current, values: { ...current.values, [id]: value } }))

  if (!own) {
    return (
      <>
        <dl className="mb-5 grid grid-cols-2 gap-3 rounded-2xl bg-sunken p-4 min-[52rem]:col-span-2">
          <Fact label={t.profiles.status} value={draft.status} />
          <Fact label={t.profiles.lookingFor} value={displayValue(draft.lookingFor)} />
        </dl>
        <div>{media}</div>
        <dl className="mt-6 grid gap-4 min-[52rem]:mt-0">
          {fields.map((field) => (
            <Fact key={field.id} label={field.label} value={displayValue(draft.values[field.id])} />
          ))}
        </dl>
      </>
    )
  }

  return (
    <>
      <div className="mb-5 grid gap-4 rounded-2xl bg-sunken p-4 min-[52rem]:col-span-2 min-[52rem]:grid-cols-[1fr_1fr_auto] min-[52rem]:items-start">
        <label className={label}>
          {t.profiles.status}
          <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className={`${control} h-11`}>
            {STATUSES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <span className="text-[13px] font-normal text-muted">{t.profiles.statusHint}</span>
        </label>
        <MultiSelect label={t.profiles.lookingFor} options={STATUSES} value={draft.lookingFor} onChange={(value) => setDraft((current) => ({ ...current, lookingFor: value }))} placeholder={t.profiles.choose} />
        <label className="flex min-h-11 items-center gap-2.5 text-[15px] font-semibold min-[52rem]:mt-7">
          <input type="checkbox" checked={draft.visible} onChange={(event) => setDraft((current) => ({ ...current, visible: event.target.checked }))} />
          {t.profiles.visibleInSearch}
        </label>
      </div>
      <div>{media}</div>
      <form className="mt-6 grid gap-4 min-[52rem]:mt-0" onSubmit={(event) => event.preventDefault()}>
        {fields.map((field) => (
          <FieldInput key={field.id} field={field} value={draft.values[field.id]} onChange={(value) => setValue(field.id, value)} />
        ))}
      </form>
    </>
  )
}

// One schema-driven renderer for every field type.
function FieldInput({ field, value, onChange }: { field: FieldDef; value: FieldValue | undefined; onChange: (value: FieldValue) => void }) {
  const text = typeof value === 'string' ? value : ''
  switch (field.type) {
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          {field.label}
        </label>
      )
    case 'multiselect':
      return <MultiSelect label={field.label} options={field.options} value={Array.isArray(value) ? value : []} onChange={onChange} placeholder={t.profiles.choose} />
    case 'select':
      return (
        <label className={label}>
          {field.label}
          <select value={text} onChange={(event) => onChange(event.target.value)} className={`${control} h-11`}>
            {field.options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      )
    case 'textarea':
      return (
        <label className={label}>
          {field.label}
          <GrowingTextarea value={text} onChange={(event) => onChange(event.target.value)} className={`${control} py-2.5 leading-normal`} />
        </label>
      )
    default:
      return (
        <label className={label}>
          {field.label}
          <input
            inputMode={field.type === 'number' ? 'numeric' : undefined}
            value={text}
            onChange={(event) => onChange(field.type === 'number' ? event.target.value.replace(/\D/g, '') : event.target.value)}
            className={`${control} h-11`}
          />
        </label>
      )
  }
}

function Fact({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[14px] font-semibold text-ink">{name}</dt>
      <dd className="mt-0.5 text-[16px] whitespace-pre-wrap text-ink-soft">{value}</dd>
    </div>
  )
}
