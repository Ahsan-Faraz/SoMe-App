'use client'

import { useEffect, useOptimistic, useState, useTransition } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { LINKED_PROFILES_MAX } from '@/lib/limits'
import { createClient } from '@/lib/supabase/browser'
import { setLinkAction } from '../actions'
import { profilePhotoUrl } from '../photo'
import type { LinkedProfile } from '../types'

const SEARCH_DELAY_MS = 250
const SEARCH_LIMIT = 20

type Change = { on: boolean; item: LinkedProfile }

// A32: your links first (remove), then people to link: those who linked to you (so you can link
// back), or the names matching the search. A link is confirmed when the other person links back:
// until then it is dimmed. Changes show at once and go back if the database refuses them.
export function LinkPicker({ slug, communityId, linked, linkedYou }: { slug: string; communityId: string; linked: LinkedProfile[]; linkedYou: LinkedProfile[] }) {
  const [list, change] = useOptimistic(linked, (current, { on, item }: Change) => (on ? [...current, item] : current.filter((row) => row.id !== item.id)))
  const [, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ query: string; items: LinkedProfile[] }>({ query: '', items: [] })
  const text = query.trim()

  // Search as you type, after a short pause; a slower, older answer never replaces a newer one.
  useEffect(() => {
    if (!text) return
    let current = true
    const timer = setTimeout(async () => {
      const { data } = await createClient().rpc('member_names', { p_community: communityId, p_query: text, p_limit: SEARCH_LIMIT })
      if (!current) return
      setFound({
        query: text,
        items: (data ?? []).map((row) => ({ id: row.user_id, username: row.username, icon: row.icon ? profilePhotoUrl(row.icon) : null, confirmed: false })),
      })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [communityId, text])

  function save(on: boolean, item: LinkedProfile) {
    setError('')
    startTransition(async () => {
      change({ on, item })
      const result = await setLinkAction(slug, item.id, on)
      if (result) setError(result.error)
    })
  }

  const full = list.length >= LINKED_PROFILES_MAX
  const linkedIds = new Set(list.map((item) => item.id))
  const youIds = new Set(linkedYou.map((item) => item.id))
  const others = (text ? (found.query === text ? found.items : []) : linkedYou).filter((item) => !linkedIds.has(item.id))

  return (
    <>
      <div className="border-b border-line px-4 py-3">
        <label className="mx-auto flex h-11 max-w-xl items-center gap-2 rounded-xl bg-rail px-3 text-ink focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" className="size-5" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.linked.search}
            aria-label={t.linked.search}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink/50"
          />
        </label>
      </div>
      <div className="mx-auto max-w-xl pb-10">
        {list.length > 0 ? (
          <ul className="divide-y divide-line border-b-4 border-line">
            {list.map((item) => (
              <Row key={item.id} item={item} note={item.confirmed ? null : t.linked.waiting} label={t.linked.remove(item.username)} icon="trash" danger onClick={() => save(false, item)} />
            ))}
          </ul>
        ) : null}
        {error ? <p role="alert" className="px-4 py-3 text-[14px] text-danger">{error}</p> : null}
        {full ? <p className="px-4 py-3 text-[14px] text-muted">{t.linked.full(LINKED_PROFILES_MAX)}</p> : null}
        {!text && others.length === 0 ? <p className="px-4 py-3 text-[14px] text-muted">{t.linked.searchHint}</p> : null}
        {text && found.query === text && others.length === 0 ? <p className="px-4 py-3 text-[14px] text-muted">{t.linked.noResults}</p> : null}
        <ul className="divide-y divide-line">
          {others.map((item) => (
            <Row
              key={item.id}
              item={item}
              note={youIds.has(item.id) ? t.linked.linkedYou : null}
              label={t.linked.add(item.username)}
              icon="plus"
              disabled={full}
              onClick={() => save(true, { ...item, confirmed: youIds.has(item.id) })}
            />
          ))}
        </ul>
      </div>
    </>
  )
}

function Row({
  item,
  note,
  label,
  icon,
  danger = false,
  disabled = false,
  onClick,
}: {
  item: LinkedProfile
  note: string | null
  label: string
  icon: 'plus' | 'trash'
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  // A link of yours that is still waiting for the other person is dimmed.
  const waiting = danger && note !== null
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 [contain-intrinsic-size:auto_60px] [content-visibility:auto]">
      <span className={`flex min-w-0 flex-1 items-center gap-3 ${waiting ? 'opacity-50' : ''}`}>
        <Avatar name={item.username} seed={item.id} src={item.icon} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{item.username}</span>
          {note ? <span className={`block truncate text-[13px] ${waiting ? 'text-muted' : 'font-semibold text-accent'}`}>{note}</span> : null}
        </span>
      </span>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className={`grid size-10 shrink-0 place-items-center rounded-full disabled:opacity-30 ${danger ? 'text-ink hover:bg-danger/10 hover:text-danger' : 'bg-rail text-ink hover:bg-soft-hover'}`}
      >
        <Icon name={icon} className="size-5" />
      </button>
    </li>
  )
}
