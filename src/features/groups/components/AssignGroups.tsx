'use client'

import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { t } from '@/lib/i18n'

type GroupRow = { id: string; name: string; member: boolean }

export function AssignGroups({
  storageKey,
  admitted,
  groups,
}: {
  storageKey: string
  admitted: boolean
  groups: GroupRow[]
}) {
  const [communityOn, setCommunityOn] = useState(admitted)
  const [picked, setPicked] = useState<string[]>(groups.filter((group) => group.member).map((group) => group.id))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      try {
        const saved = JSON.parse(raw) as { community?: boolean; groups?: string[] }
        if (typeof saved.community === 'boolean') setCommunityOn(saved.community)
        if (Array.isArray(saved.groups)) setPicked(saved.groups)
      } catch {
        // Keep the server membership when the saved value is unreadable.
      }
    }
    setReady(true)
  }, [storageKey])

  useEffect(() => {
    if (!ready) return
    localStorage.setItem(storageKey, JSON.stringify({ community: communityOn, groups: picked }))
  }, [ready, storageKey, communityOn, picked])

  return (
    <div className="px-4 pt-6 sm:px-8">
      <h2 className="text-[22px] font-bold">{t.groups.addToGroups}</h2>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line">
        <li className="flex h-14 items-center gap-3 bg-sunken px-4">
          <span className="flex-1 text-[16px] font-semibold">{t.groups.community}</span>
          <input
            type="checkbox"
            checked={communityOn}
            aria-label={t.groups.admit}
            onChange={(event) => setCommunityOn(event.target.checked)}
          />
        </li>
        {groups.map((group) => {
          const on = picked.includes(group.id)
          return (
            <li key={group.id} className="flex h-14 items-center gap-3 px-4">
              <Avatar name={group.name} seed={group.id} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{group.name}</span>
              <input
                type="checkbox"
                checked={on}
                aria-label={group.name}
                onChange={() => setPicked((current) => (on ? current.filter((id) => id !== group.id) : [...current, group.id]))}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
