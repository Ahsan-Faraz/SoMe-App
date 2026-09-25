'use client'

import Link from 'next/link'
import { useDeferredValue, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import type { GroupMember } from '../types'

export function AddList({ community, people }: { community: string; people: GroupMember[] }) {
  const [query, setQuery] = useState('')
  const [added, setAdded] = useState<string[]>([])
  const deferred = useDeferredValue(query.trim().toLowerCase())
  const visible = deferred ? people.filter((person) => person.username.toLowerCase().includes(deferred)) : people

  return (
    <>
      <div className="px-4 py-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-rail px-3 text-ink focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" className="size-5" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.groups.filter}
            aria-label={t.groups.filter}
            className="h-full flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink/50"
          />
        </label>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
        {visible.map((person) => {
          const chosen = added.includes(person.id)
          return (
            <li key={person.id} className="flex items-center gap-3 px-4 py-2.5 [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
              <Link href={`/${community}/profiles/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={person.username} seed={person.id} />
                <span className="truncate text-[16px] font-semibold">{person.username}</span>
              </Link>
              <button
                type="button"
                aria-label={t.groups.add}
                onClick={() => setAdded((current) => (chosen ? current.filter((id) => id !== person.id) : [...current, person.id]))}
                aria-pressed={chosen}
                className={`flex size-10 items-center justify-center rounded-full ${chosen ? 'bg-accent text-white' : 'bg-rail text-ink hover:bg-soft-hover'}`}
              >
                <Icon name="plus" className="size-5" />
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
