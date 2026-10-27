'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/browser'
import { saveMember } from '../save'
import { wholeNumber } from '../numbers'
import { ROSTER_PAGE, fetchRosterPage, type StatusLabels } from '../rows'
import type { MemberRecord, RosterEdit, RosterMode, Scope } from '../types'

const cell = 'h-10 w-full min-w-0 rounded-lg border border-line bg-canvas px-2.5 text-[15px] text-ink outline-none focus:border-accent'
const SEARCH_DELAY_MS = 250
// Start loading the next page this far before the end of the list.
const LOAD_AHEAD = '600px'

type Page = { rows: MemberRecord[]; done: boolean }

// A30 group members · A31 community members · A20/A23 applications. One layout for all four.
// Profile state and notes are edited right in the list, so it also works as a door list at an event.
// The server's first page, then the next pages as you scroll; typing searches the whole list in the
// database (name or real names), so anyone can be found however long the list is.
export function RosterList({
  community,
  communityId,
  scope,
  first,
  labels,
  mode,
  profileBase,
}: {
  community: string
  communityId: string
  scope: Pick<Scope, 'kind' | 'id' | 'stateLabels'>
  first: MemberRecord[]
  labels: StatusLabels
  mode: RosterMode
  profileBase: string
}) {
  // The profile's Back returns to this list (members or applications).
  const back = `?back=${encodeURIComponent(usePathname())}`
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()
  // Pages after the server's first one; and the search's pages, for the text they were found for.
  const [more, setMore] = useState<Page>({ rows: [], done: first.length < ROSTER_PAGE })
  const [found, setFound] = useState<Page & { query: string }>({ query: '', rows: [], done: true })
  const loading = useRef(false)
  const end = useRef<HTMLDivElement>(null)
  const text = query.trim()

  // Saved when a field is left (or on Remove), in the database; the first page then comes back fresh,
  // and someone removed leaves the later pages and the search at once.
  const save = (row: MemberRecord, edit: RosterEdit) => {
    setError('')
    startTransition(async () => {
      const failed = await saveMember(community, scope, row, edit)
      setError(failed ?? '')
      if (failed || !edit.removed) return
      const without = (list: MemberRecord[]) => list.filter((item) => item.userId !== row.userId)
      setMore((current) => ({ ...current, rows: without(current.rows) }))
      setFound((current) => ({ ...current, rows: without(current.rows) }))
    })
  }

  const rows = useMemo(() => {
    if (text) return found.query === text ? found.rows : []
    const shown = new Set(first.map((row) => row.userId))
    return [...first, ...more.rows.filter((row) => !shown.has(row.userId))]
  }, [first, found, more.rows, text])
  const done = text ? found.query !== text || found.done : more.done

  const page = useCallback(
    (search: string, after: MemberRecord | undefined) => fetchRosterPage(createClient(), communityId, scope, mode, search, after, labels),
    [communityId, labels, mode, scope],
  )

  // Search as you type, after a short pause; a slower, older answer never replaces a newer one.
  useEffect(() => {
    if (!text) return
    let current = true
    const timer = setTimeout(async () => {
      try {
        const result = await page(text, undefined)
        if (current) setFound({ query: text, rows: result, done: result.length < ROSTER_PAGE })
      } catch {
        if (current) setError(t.common.error)
      }
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [page, text])

  const loadMore = useCallback(async () => {
    if (loading.current || done || rows.length === 0) return
    loading.current = true
    try {
      const next = await page(text, rows.at(-1))
      const add = (current: Page) => ({ rows: [...current.rows, ...next], done: next.length < ROSTER_PAGE })
      if (text) setFound((current) => (current.query === text ? { ...add(current), query: text } : current))
      else setMore(add)
    } catch {
      // Tried again on the next scroll.
    } finally {
      loading.current = false
    }
  }, [done, page, rows, text])

  useEffect(() => {
    const node = end.current
    if (!node || done) return
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && void loadMore(), { rootMargin: LOAD_AHEAD })
    observer.observe(node)
    return () => observer.disconnect()
  }, [done, loadMore])

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
      {error ? (
        <p role="alert" className="mx-auto max-w-3xl px-4 pt-3 text-[15px] text-danger sm:px-6">
          {error}
        </p>
      ) : null}
      {text && found.query !== text ? null : rows.length === 0 ? (
        <p className="px-6 py-10 text-center text-muted">{mode === 'applications' ? t.membership.emptyApplications : t.membership.empty}</p>
      ) : (
        <ul className="mx-auto grid max-w-6xl grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-3 p-3 sm:p-6">
          {rows.map((row) => (
            <li key={row.userId} className="[contain-intrinsic-size:auto_220px] [content-visibility:auto]">
              {/* Keyed by the saved values: a row re-seeds when fresh saved data arrives. */}
              <RosterRow key={`${row.state.join('|')}|${row.notes}`} row={row} labels={scope.stateLabels} href={`${profileBase}/${row.userId}${back}`} onSave={save} />
            </li>
          ))}
        </ul>
      )}
      <div ref={end} aria-hidden />
    </>
  )
}

// One row keeps its own input state, so typing re-renders just that row. Saved when a field is left.
const RosterRow = memo(function RosterRow({
  row,
  labels,
  href,
  onSave,
}: {
  row: MemberRecord
  labels: string[]
  href: string
  onSave: (row: MemberRecord, edit: RosterEdit) => void
}) {
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
            {row.status ? <span className="shrink-0 rounded-full bg-rail px-2 py-0.5 text-[12px] font-semibold">{row.status}</span> : null}
          </span>
          {names.length > 0 ? <span className="mt-0.5 block truncate text-[14px] text-ink-soft">{names.join(' · ')}</span> : null}
          {row.applied && row.message ? <span className="mt-0.5 block truncate text-[14px] text-muted">{row.message}</span> : null}
        </Link>
        {asking ? (
          <button
            type="button"
            onClick={() => onSave(row, { removed: true })}
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
                  if (state.join('|') !== row.state.join('|')) onSave(row, { state })
                }}
                className={cell}
              />
            </label>
          ) : null,
        )}
      </div>
      <label className="mt-2 grid gap-1 text-[12px] font-semibold text-muted">
        {t.membership.notes}
        <input value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => notes !== row.notes && onSave(row, { notes })} className={cell} />
      </label>
    </article>
  )
})
