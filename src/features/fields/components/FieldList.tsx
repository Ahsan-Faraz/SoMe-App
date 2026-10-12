'use client'

import Link from 'next/link'
import { useOptimistic, useState, useTransition } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { reorderFieldsAction } from '../actions'
import type { FieldDef, StatusChoice } from '../types'

const iconButton = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-hover disabled:opacity-30'

// The profile's fields in order. Moving one saves the new order at once; the list moves first.
// The server's list (props) is the truth: the optimistic order shows until the save's fresh list
// arrives, and drops back to the server's list on its own if the save fails.
export function FieldList({ community, fields: saved, statuses }: { community: string; fields: readonly FieldDef[]; statuses: readonly StatusChoice[] }) {
  const [fields, setOptimistic] = useOptimistic(saved)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const statusName = new Map(statuses.map((status) => [status.id, status.label]))

  const move = (index: number, by: -1 | 1) => {
    const next = [...fields]
    const [field] = next.splice(index, 1)
    if (!field) return
    next.splice(index + by, 0, field)
    setError(null)
    startTransition(async () => {
      setOptimistic(next)
      const result = await reorderFieldsAction(community, next.map((item) => item.id))
      if (result) setError(result.error)
    })
  }

  if (fields.length === 0) return <p className="rounded-2xl bg-sunken px-4 py-6 text-center text-[15px] text-muted">{t.builder.empty}</p>

  return (
    <>
      {error ? (
        <p role="alert" className="mb-2 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      <ol className="grid grid-cols-1 gap-2">
        {fields.map((field, index) => {
          const tags = [
            t.builder.kinds[field.kind],
            field.required && t.builder.required,
            field.searchable && t.builder.searchable,
            field.onCard && t.builder.onCard,
            field.perPerson && t.builder.perPerson,
          ].filter(Boolean)
          const shownFor = field.statuses ? field.statuses.map((id) => statusName.get(id) ?? '').filter(Boolean).join(', ') : t.builder.everyStatus
          return (
            <li key={field.id} className={`flex items-center gap-1 rounded-2xl border border-line pl-1 ${field.active ? '' : 'bg-sunken'}`}>
              <Link href={`/${community}/admin/fields/${field.id}`} className="min-w-0 flex-1 rounded-xl px-3 py-2.5 hover:bg-hover">
                <span className={`block text-[16px] font-semibold break-words ${field.active ? '' : 'text-muted'}`}>
                  {field.label}
                  {field.active ? null : <span className="ml-2 text-[13px] font-semibold text-muted uppercase">{t.builder.retired}</span>}
                </span>
                <span className="block text-[13px] text-muted">{tags.join(' · ')}</span>
                <span className="block text-[13px] text-muted">
                  {t.builder.forStatuses}: {shownFor}
                </span>
              </Link>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t.builder.moveUp(field.label)} className={iconButton}>
                <Icon name="chevronRight" className="size-5 -rotate-90" />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === fields.length - 1} aria-label={t.builder.moveDown(field.label)} className={iconButton}>
                <Icon name="chevronRight" className="size-5 rotate-90" />
              </button>
            </li>
          )
        })}
      </ol>
    </>
  )
}
