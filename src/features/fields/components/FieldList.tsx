'use client'

import Link from 'next/link'
import { useOptimistic, useState, useTransition } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { reorderLayoutAction } from '../actions'
import type { Builtins, Choice, FieldDef, LayoutItem, StatusChoice } from '../types'

const iconButton = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-hover disabled:opacity-30'

// The profile's order: the fields and the basic fields in one list, as profiles show them. Moving
// one saves the new order at once; the list moves first. The server's list (props) is the truth:
// the optimistic order shows until the save's fresh list arrives, and drops back to it if the save fails.
export function FieldList({
  community,
  layout: saved,
  fields,
  statuses,
  substatuses,
  builtins,
}: {
  community: string
  layout: readonly LayoutItem[]
  fields: readonly FieldDef[]
  statuses: readonly StatusChoice[]
  substatuses: readonly Choice[]
  builtins: Builtins
}) {
  const [layout, setOptimistic] = useOptimistic(saved)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const byId = new Map(fields.map((field) => [field.id, field]))

  const move = (index: number, by: -1 | 1) => {
    const next = [...layout]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(index + by, 0, item)
    setError(null)
    startTransition(async () => {
      setOptimistic(next)
      const result = await reorderLayoutAction(community, next)
      if (result) setError(result.error)
    })
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mb-2 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      <ol className="grid grid-cols-1 gap-2">
        {layout.map((item, index) => {
          const name = item.type === 'builtin' ? t.builder.basicNames[item.key] : (byId.get(item.id)?.label ?? '')
          return (
            <li key={item.type === 'builtin' ? item.key : item.id} className="flex items-center gap-1 rounded-2xl border border-line pl-1">
              {item.type === 'builtin' ? <BasicRow name={name} shown={builtins[item.key]} /> : <FieldRow community={community} field={byId.get(item.id)} statuses={statuses} substatuses={substatuses} />}
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t.builder.moveUp(name)} className={iconButton}>
                <Icon name="chevronRight" className="size-5 -rotate-90" />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === layout.length - 1} aria-label={t.builder.moveDown(name)} className={iconButton}>
                <Icon name="chevronRight" className="size-5 rotate-90" />
              </button>
            </li>
          )
        })}
      </ol>
      {fields.length === 0 ? <p className="rounded-2xl bg-sunken px-4 py-6 text-center text-[15px] text-muted">{t.builder.empty}</p> : null}
    </>
  )
}

// A basic field: moved here, switched on or off under Basic fields.
function BasicRow({ name, shown }: { name: string; shown: boolean }) {
  return (
    <span className={`min-w-0 flex-1 px-3 py-2.5 ${shown ? '' : 'opacity-60'}`}>
      <span className="block text-[16px] font-semibold break-words">{name}</span>
      <span className="block text-[13px] text-muted">{shown ? t.builder.basicField : `${t.builder.basicField} · ${t.builder.hidden}`}</span>
    </span>
  )
}

// The names of the chosen choices, in the list's own order.
const names = (choices: readonly Choice[], ids: readonly string[]) =>
  choices
    .filter((choice) => ids.includes(choice.id))
    .map((choice) => choice.label)
    .join(', ')

function FieldRow({
  community,
  field,
  statuses,
  substatuses,
}: {
  community: string
  field: FieldDef | undefined
  statuses: readonly StatusChoice[]
  substatuses: readonly Choice[]
}) {
  if (!field) return <span className="min-w-0 flex-1" />
  const tags = [t.builder.kinds[field.kind], field.required && t.builder.required, field.searchable && t.builder.searchable, field.onCard && t.builder.onCard].filter(Boolean)
  const shownFor = field.statuses ? names(statuses, field.statuses) : t.builder.everyStatus
  const section = field.substatuses ? names(substatuses, field.substatuses) : t.builder.mainSection
  return (
    <Link href={`/${community}/admin/fields/${field.id}`} className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 hover:bg-hover ${field.active ? '' : 'bg-sunken'}`}>
      <span className={`block text-[16px] font-semibold break-words ${field.active ? '' : 'text-muted'}`}>
        {field.label}
        {field.active ? null : <span className="ml-2 text-[13px] font-semibold text-muted uppercase">{t.builder.retired}</span>}
      </span>
      <span className="block text-[13px] text-muted">{tags.join(' · ')}</span>
      <span className="block text-[13px] text-muted">
        {t.builder.forStatuses}: {shownFor}
      </span>
      <span className="block text-[13px] text-muted">
        {t.builder.section}: {section}
      </span>
    </Link>
  )
}
