'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { memo, useDeferredValue, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { editMember, rosterKey, useRoster, wholeNumber } from '../storage'
import type { MemberRecord, Roster, Scope } from '../types'

const cell = 'h-10 w-full min-w-0 rounded-lg border border-line bg-canvas px-2.5 text-[15px] text-ink outline-none focus:border-accent'

// A30 group members · A31 community members · A20/A23 applications. One layout for all four.
// Profile state and notes are edited right in the list, so it also works as a door list at an event.
export function RosterList({
  community,
  scope,
  seed,
  mode,
  profileBase,
}: {
  community: string
  scope: Pick<Scope, 'kind' | 'id' | 'stateLabels'>
  seed: Roster
  mode: 'members' | 'applications'
  profileBase: string
}) {
  const roster = useRoster(community, scope, seed)
  // The profile's Back returns to this list (members or applications).
  const back = `?back=${encodeURIComponent(usePathname())}`
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query.trim().toLowerCase())
  const key = rosterKey(community, scope)
  const rows = roster[mode]
  const visible = deferred ? rows.filter((row) => `${row.username} ${row.realNames.join(' ')}`.toLowerCase().includes(deferred)) : rows

  return (
    <>
      <div className="border-b border-line px-4 py-3 sm:px-6">
        <label className="mx-auto flex h-11 max-w-3xl items-center gap-2 rounded-xl bg-rail px-3 text-ink focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" className="size-5" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.membership.search}
            aria-label={t.membership.search}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink/50"
          />
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-muted">{mode === 'applications' ? t.membership.emptyApplications : t.membership.empty}</p>
      ) : (
        <ul className="mx-auto grid max-w-6xl grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-3 p-3 sm:p-6">
          {visible.map((row) => (
            <li key={row.userId} className="[contain-intrinsic-size:auto_220px] [content-visibility:auto]">
              {/* Keyed by the saved values: a row re-seeds when this device's saved data arrives after first paint. */}
              <RosterRow key={`${row.state.join('|')}|${row.notes}`} storageKey={key} row={row} labels={scope.stateLabels} href={`${profileBase}/${row.userId}${back}`} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// One row keeps its own input state, so typing re-renders just that row. Saved when a field is left.
const RosterRow = memo(function RosterRow({ storageKey, row, labels, href }: { storageKey: string; row: MemberRecord; labels: string[]; href: string }) {
  const [state, setState] = useState(row.state)
  const [notes, setNotes] = useState(row.notes)
  const [asking, setAsking] = useState(false)
  const names = row.realNames.filter(Boolean)

  return (
    <article className="h-full rounded-2xl border border-line p-3">
      <div className="flex items-start gap-2">
        <Link href={href} className="min-w-0 flex-1 rounded-lg hover:underline">
          <span className="flex items-center gap-2">
            <span className="truncate text-[16px] font-bold">{row.username}</span>
            <span className="shrink-0 rounded-full bg-rail px-2 py-0.5 text-[12px] font-semibold">{row.status}</span>
          </span>
          {names.length > 0 ? <span className="mt-0.5 block truncate text-[14px] text-ink-soft">{names.join(' · ')}</span> : null}
          {row.applied && row.message ? <span className="mt-0.5 block truncate text-[14px] text-muted">{row.message}</span> : null}
        </Link>
        {asking ? (
          <button
            type="button"
            onClick={() => editMember(storageKey, row.userId, { removed: true })}
            onBlur={() => setAsking(false)}
            autoFocus
            className="h-9 shrink-0 rounded-lg bg-danger px-3 text-[14px] font-semibold text-white"
          >
            {t.membership.removeConfirm}
          </button>
        ) : (
          <button
            type="button"
            aria-label={t.membership.remove(row.username)}
            title={t.membership.remove(row.username)}
            onClick={() => setAsking(true)}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink hover:bg-danger/10 hover:text-danger"
          >
            <Icon name="trash" className="size-5" />
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {labels.map((label, index) =>
          label ? (
            <label key={index} className="grid min-w-0 gap-1 text-[12px] font-semibold text-muted">
              <span className="truncate">{label}</span>
              <input
                inputMode="numeric"
                value={state[index] ?? ''}
                onChange={(event) => setState((current) => current.map((item, i) => (i === index ? wholeNumber(event.target.value) : item)))}
                onBlur={() => {
                  if (state.join('|') !== row.state.join('|')) editMember(storageKey, row.userId, { state })
                }}
                className={cell}
              />
            </label>
          ) : null,
        )}
      </div>
      <label className="mt-2 grid gap-1 text-[12px] font-semibold text-muted">
        {t.membership.notes}
        <input value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => notes !== row.notes && editMember(storageKey, row.userId, { notes })} className={cell} />
      </label>
    </article>
  )
})
