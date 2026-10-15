import { Fragment, type ReactNode } from 'react'
import type { ProfileLayout, Slot } from '@/features/fields/schema'
import type { FieldDef, LayoutBuiltin } from '@/features/fields/types'
import { t } from '@/lib/i18n'
import { displayValue, valueKey, type FieldValue } from '../fields'
import type { ProfilePhoto } from '../types'
import { FullPhoto } from './FullPhoto'

// What a basic field shows, server-rendered by the profile screen (the image, the score, links...).
export type BuiltinNodes = Partial<Record<LayoutBuiltin, ReactNode>>

// A3 body for someone else's profile (also A27 browse): `top` (Status and facts), then the profile in
// the community's order: the main section, then a section per person ("The Man", "The Woman") with
// their age and the fields set for their substatus. One person: no heading. Photos are full width
// at their place. No client JavaScript.
export function ProfileAnswers({
  top,
  layout,
  nodes,
  ages,
  values,
  photoValues = {},
}: {
  top: ReactNode
  layout: ProfileLayout
  nodes: BuiltinNodes
  ages: Record<string, number | null> // by person key ('' = the main person)
  values: Record<string, FieldValue>
  photoValues?: Record<string, ProfilePhoto>
}) {
  const render = (slot: Slot, personKey: string) => {
    if (slot.type === 'builtin') {
      if (slot.key !== 'age') return <Fragment key={slot.key}>{nodes[slot.key]}</Fragment>
      const age = ages[personKey] ?? null
      return <Fact key="age" label={t.profiles.age} value={age === null ? '—' : String(age)} />
    }
    const key = valueKey(slot.field.id, personKey)
    return <Answer key={key} field={slot.field} value={values[key]} photo={photoValues[key]} />
  }

  return (
    <>
      {top}
      <div className="grid gap-5">{layout.main.map((slot) => render(slot, ''))}</div>
      {layout.sections.map(({ person, slots }) => (
        <section key={person.key} aria-label={person.label} className="mt-6 grid gap-5">
          {layout.sections.length > 1 ? <h2 className="border-b border-line pb-1 text-[17px] font-bold">{person.label}</h2> : null}
          {slots.map((slot) => render(slot, person.key))}
        </section>
      ))}
    </>
  )
}

function Answer({ field, value, photo }: { field: FieldDef; value: FieldValue | undefined; photo: ProfilePhoto | undefined }) {
  if (field.kind !== 'photo') return <Fact label={field.label} value={displayValue(field, value)} />
  return (
    <div className="grid gap-1.5">
      <h3 className="text-[14px] font-semibold text-ink">{field.label}</h3>
      {photo ? <FullPhoto photo={photo} alt={field.label} /> : <p className="text-[16px] text-ink-soft">—</p>}
    </div>
  )
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <dl className="min-w-0">
      <dt className="text-[14px] font-semibold text-ink">{label}</dt>
      <dd className="mt-0.5 text-[16px] whitespace-pre-wrap text-ink-soft">{value}</dd>
    </dl>
  )
}
