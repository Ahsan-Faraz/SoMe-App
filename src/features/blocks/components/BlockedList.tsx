'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { t } from '@/lib/i18n'
import { unblockAction } from '../actions'
import type { BlockedPerson } from '../types'

// The people you blocked, each with Unblock. A row goes at once; the server's list follows.
export function BlockedList({ community, people }: { community: string; people: BlockedPerson[] }) {
  const [shown, remove] = useOptimistic(people, (current, userId: string) => current.filter((person) => person.userId !== userId))
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  function unblock(person: BlockedPerson) {
    setError('')
    startTransition(async () => {
      remove(person.userId)
      const result = await unblockAction(community, person.userId)
      if (result) setError(result.error)
    })
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:px-8">
      <p className="text-[15px] leading-relaxed text-ink-soft">{t.blocked.intro}</p>
      {error ? (
        <p role="alert" className="mt-4 text-[15px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {shown.length ? (
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {shown.map((person) => (
            <li key={person.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={person.username} seed={person.userId} src={person.icon} />
              <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{person.username}</span>
              <button
                type="button"
                onClick={() => unblock(person)}
                className="h-10 shrink-0 rounded-xl bg-rail px-4 text-[15px] font-semibold text-ink hover:bg-soft-hover"
              >
                {t.blocked.unblock}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-[15px] text-muted">{t.blocked.none}</p>
      )}
    </main>
  )
}
