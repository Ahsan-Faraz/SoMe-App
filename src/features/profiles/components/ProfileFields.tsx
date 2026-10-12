'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { GrowingTextarea } from '@/components/ui/GrowingTextarea'
import { Icon } from '@/components/ui/Icon'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { t } from '@/lib/i18n'
import { FIELD_TEXT_MAX } from '@/lib/limits'
import { activeLabels, fieldsForStatus } from '@/features/fields/schema'
import type { FieldDef, StatusChoice } from '@/features/fields/types'
import { displayValue, seedValues, valueKey, type FieldValue } from '../fields'
import { readStatus, useStatus, writeStatus } from '../status'

type Draft = { lookingFor: string[]; visible: boolean; values: Record<string, FieldValue> }

const control = 'rounded-xl border border-line-strong bg-canvas px-3 text-[16px] font-normal text-ink outline-none focus:border-accent'
const label = 'grid gap-1.5 text-[14px] font-semibold text-ink'
const hint = 'text-[13px] font-normal text-muted'

// A3/B1 body. Status sits at the top because it decides which fields the profile has (D4).
// `media` (photos + facts) is server-rendered and slotted in between, so it stays out of the client bundle.
// `statuses` and `fields` are the community's profile builder. The Status can still change on this
// device (the first pick), so the fields for it are chosen here.
export function ProfileFields({
  community,
  userId,
  storageKey,
  own,
  statuses,
  fields,
  status: serverStatus,
  lookingFor,
  about,
  headline,
  media,
}: {
  community: string
  userId: string
  storageKey: string
  own: boolean
  statuses: readonly StatusChoice[]
  fields: readonly FieldDef[]
  status: string // '' = not chosen yet
  lookingFor: string[]
  about: string
  headline: string
  media: ReactNode
}) {
  const { status, ready: statusReady } = useStatus(community, userId, serverStatus)
  const [draft, setDraft] = useState<Draft>(() => ({ lookingFor, visible: true, values: seedValues(fields, about, headline) }))
  const [ready, setReady] = useState(false)
  const statusChoice = statuses.find((item) => item.label === status)
  const shown = fieldsForStatus(fields, statusChoice)
  const people = statusChoice?.people ?? 1
  const statusLabels = activeLabels(statuses)

  // Own profile only: keep edits on this device until the profile table is wired.
  useEffect(() => {
    if (!own) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as (Partial<Draft> & { status?: unknown }) | null
      // Drafts from before status was locked kept a status: that was the profile's choice, so keep it (locked).
      if (typeof saved?.status === 'string' && saved.status && !readStatus(community, userId)) writeStatus(community, userId, saved.status)
      if (saved) {
        setDraft((current) => ({
          lookingFor: saved.lookingFor ?? current.lookingFor,
          visible: saved.visible ?? current.visible,
          values: { ...current.values, ...saved.values },
        }))
      }
    } catch {
      // Unreadable draft: keep the server values.
    }
    setReady(true)
  }, [own, storageKey, community, userId])

  useEffect(() => {
    if (ready) localStorage.setItem(storageKey, JSON.stringify(draft))
  }, [ready, storageKey, draft])

  const setValue = (id: string, value: FieldValue) => setDraft((current) => ({ ...current, values: { ...current.values, [id]: value } }))

  if (!own) {
    return (
      <>
        <dl className="mb-5 grid grid-cols-2 gap-3 rounded-2xl bg-sunken p-4 min-[52rem]:col-span-2">
          <Fact label={t.profiles.status} value={status || '—'} />
          <Fact label={t.profiles.lookingFor} value={draft.lookingFor.join(', ') || '—'} />
        </dl>
        <div>{media}</div>
        <dl className="mt-6 grid gap-4 min-[52rem]:mt-0">
          {shown.flatMap((field) =>
            persons(field, people).map((person) => (
              <Fact key={valueKey(field.id, person)} label={personLabel(field, people, person)} value={displayValue(field, draft.values[valueKey(field.id, person)])} />
            )),
          )}
        </dl>
      </>
    )
  }

  return (
    <>
      <div className="mb-5 grid gap-4 rounded-2xl bg-sunken p-4 min-[52rem]:col-span-2 min-[52rem]:grid-cols-[1fr_1fr_auto] min-[52rem]:items-start">
        {statusReady ? <StatusField community={community} userId={userId} status={status} options={statusLabels} /> : <div className="min-h-11" />}
        <MultiSelect label={t.profiles.lookingFor} options={statusLabels} value={draft.lookingFor} onChange={(value) => setDraft((current) => ({ ...current, lookingFor: value }))} placeholder={t.profiles.choose} />
        <label className="flex min-h-11 items-center gap-2.5 text-[15px] font-semibold min-[52rem]:mt-7">
          <input type="checkbox" checked={draft.visible} onChange={(event) => setDraft((current) => ({ ...current, visible: event.target.checked }))} />
          {t.profiles.visibleInSearch}
        </label>
      </div>
      <div>{media}</div>
      {status ? (
        <form className="mt-6 grid gap-4 min-[52rem]:mt-0" onSubmit={(event) => event.preventDefault()}>
          {shown.flatMap((field) =>
            persons(field, people).map((person) => {
              const key = valueKey(field.id, person)
              return <FieldInput key={key} field={field} label={personLabel(field, people, person)} value={draft.values[key]} onChange={(value) => setValue(key, value)} />
            }),
          )}
        </form>
      ) : statusReady ? (
        <p className="mt-6 rounded-2xl border-2 border-dashed border-line-strong p-4 text-[15px] text-muted min-[52rem]:mt-0">{t.profiles.statusFirst}</p>
      ) : null}
    </>
  )
}

// Own profile. A new profile picks its status once (Set status); after that it is shown locked,
// as plain text: only the community admin can change it (A21, admin panel).
function StatusField({ community, userId, status, options }: { community: string; userId: string; status: string; options: readonly string[] }) {
  const [choice, setChoice] = useState('')

  if (status) {
    return (
      <div className={label}>
        <span>{t.profiles.status}</span>
        <p className="flex h-11 items-center gap-2 text-[16px] font-normal">
          <Icon name="lock" className="size-4 text-muted" />
          {status}
        </p>
        <span className={hint}>{t.profiles.statusLocked}</span>
      </div>
    )
  }

  return (
    <div className="grid gap-1.5">
      <label className={label}>
        {t.profiles.statusChoose}
        <select value={choice} onChange={(event) => setChoice(event.target.value)} className={`${control} h-11`}>
          <option value="" disabled>
            {t.profiles.choose}
          </option>
          {options.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <span className={hint}>
        {t.profiles.statusHint} {t.profiles.statusOnce}
      </span>
      <button type="button" disabled={!choice} onClick={() => writeStatus(community, userId, choice)} className={`${buttonClass('primary')} mt-1 disabled:opacity-40`}>
        {t.profiles.statusConfirm}
      </button>
    </div>
  )
}

// A couple (2 people) answers per-person fields once each.
function persons(field: FieldDef, people: 1 | 2): (1 | 2)[] {
  return field.perPerson && people === 2 ? [1, 2] : [1]
}

function personLabel(field: FieldDef, people: 1 | 2, person: 1 | 2): string {
  return field.perPerson && people === 2 ? t.profiles.person(field.label, person) : field.label
}

// One schema-driven renderer for every field type.
function FieldInput({ field, label: name, value, onChange }: { field: FieldDef; label: string; value: FieldValue | undefined; onChange: (value: FieldValue) => void }) {
  const text = typeof value === 'string' ? value : ''
  const choices = field.choices.filter((choice) => choice.active)
  switch (field.kind) {
    case 'yes_no':
      return (
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          {name}
        </label>
      )
    case 'pick_several':
      return (
        <MultiSelect
          label={name}
          options={choices.map((choice) => choice.id)}
          format={(id) => field.choices.find((choice) => choice.id === id)?.label ?? ''}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          placeholder={t.profiles.choose}
        />
      )
    case 'pick_one':
      return (
        <label className={label}>
          {name}
          <select value={text} onChange={(event) => onChange(event.target.value)} className={`${control} h-11`}>
            <option value="">{t.profiles.choose}</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'long_text':
      return (
        <label className={label}>
          {name}
          <GrowingTextarea value={text} onChange={(event) => onChange(event.target.value)} maxLength={field.maxLength ?? FIELD_TEXT_MAX} className={`${control} py-2.5 leading-normal`} />
        </label>
      )
    case 'date':
      return (
        <label className={label}>
          {name}
          <input type="date" value={text} onChange={(event) => onChange(event.target.value)} className={`${control} h-11`} />
        </label>
      )
    case 'photo':
      // Photo answers need the profile bucket: they arrive with profile photos (step 3).
      return null
    default:
      return (
        <label className={label}>
          {name}
          <input
            inputMode={field.kind === 'number' ? 'decimal' : undefined}
            value={text}
            maxLength={field.maxLength ?? undefined}
            onChange={(event) => onChange(field.kind === 'number' ? event.target.value.replace(/[^\d.,-]/g, '') : event.target.value)}
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
