'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { linkedKey, readLinked } from '../linked'
import type { LinkedProfile } from '../types'

// Linked profiles on a profile. Your own list is edited on A32 (Add profiles).
export function LinkedProfiles({
  community,
  userId,
  own,
  linked,
  linkBase,
}: {
  community: string
  userId: string
  own: boolean
  linked: LinkedProfile[]
  linkBase: string
}) {
  const [list, setList] = useState(linked)

  useEffect(() => {
    if (own) setList(readLinked(linkedKey(community, userId)) ?? linked)
  }, [own, community, userId, linked])

  if (!own && list.length === 0) return null

  return (
    <section className="mt-5">
      <h2 className="text-[14px] font-semibold text-ink">{t.profiles.linked}</h2>
      {list.length === 0 ? <p className="mt-1 text-[15px] text-muted">{t.profiles.linkedNone}</p> : null}
      <ul className="mt-2 grid gap-1">
        {list.map((item) => (
          <li key={item.id}>
            <Link href={`${linkBase}/${item.id}`} className="flex items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-hover">
              <Avatar name={item.username} seed={item.id} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{item.username}</span>
              <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      {own ? (
        <Link href={`/${community}/profiles/${userId}/linked`} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-soft px-3 text-[15px] font-semibold hover:bg-soft-hover">
          <Icon name="plus" className="size-4" />
          {t.linked.edit}
        </Link>
      ) : null}
    </section>
  )
}
