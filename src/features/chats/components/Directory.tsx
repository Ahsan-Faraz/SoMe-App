'use client'

import Link from 'next/link'
import { useDeferredValue, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import type { DirectoryEntry } from '../types'

export function Directory({ entries }: { entries: DirectoryEntry[] }) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query.trim().toLowerCase())
  const visible = deferred ? entries.filter((entry) => entry.name.toLowerCase().includes(deferred)) : entries

  return (
    <>
      <div className="border-b border-line px-4 py-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-rail px-3 text-ink focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" className="size-5" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.chats.joinSearch}
            aria-label={t.chats.joinSearch}
            className="h-full flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink/50"
          />
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-muted">{t.chats.joinEmpty}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
          {visible.map((entry) => (
            <li key={entry.id} className="[contain-intrinsic-size:auto_56px] [content-visibility:auto]">
              <Link
                href={entry.href}
                className="mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-black/[0.04]"
              >
                <Avatar name={entry.name} seed={entry.id} shape={entry.kind === 'group' ? 'square' : 'circle'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{entry.name}</span>
                  {entry.detail ? <span className="block truncate text-[14px] text-muted">{entry.detail}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
