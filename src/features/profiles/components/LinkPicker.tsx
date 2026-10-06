'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { linkedKey, readLinked, writeLinked } from '../linked'
import { MAX_LINKED } from '../options'
import type { LinkedProfile } from '../types'

// A32: linked profiles always first (delete link), then everyone else (add link) until the limit.
export function LinkPicker({ community, userId, linked, candidates }: { community: string; userId: string; linked: LinkedProfile[]; candidates: LinkedProfile[] }) {
  const key = linkedKey(community, userId)
  const [list, setList] = useState(linked)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query.trim().toLowerCase())

  useEffect(() => setList(readLinked(key) ?? linked), [key, linked])

  function save(next: LinkedProfile[]) {
    setList(next)
    writeLinked(key, next)
  }

  const full = list.length >= MAX_LINKED
  const linkedIds = new Set(list.map((item) => item.id))
  const others = candidates.filter((item) => !linkedIds.has(item.id) && (!deferred || item.username.toLowerCase().includes(deferred)))

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
              <Row key={item.id} item={item} label={t.linked.remove(item.username)} icon="trash" danger onClick={() => save(list.filter((row) => row.id !== item.id))} />
            ))}
          </ul>
        ) : null}
        {full ? <p className="px-4 py-3 text-[14px] text-muted">{t.linked.full(MAX_LINKED)}</p> : null}
        <ul className="divide-y divide-line">
          {others.map((item) => (
            <Row key={item.id} item={item} label={t.linked.add(item.username)} icon="plus" disabled={full} onClick={() => save([...list, item])} />
          ))}
        </ul>
      </div>
    </>
  )
}

function Row({ item, label, icon, danger = false, disabled = false, onClick }: { item: LinkedProfile; label: string; icon: 'plus' | 'trash'; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 [contain-intrinsic-size:auto_60px] [content-visibility:auto]">
      <Avatar name={item.username} seed={item.id} />
      <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{item.username}</span>
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
