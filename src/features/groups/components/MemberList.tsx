'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import type { GroupMember } from '../types'

export function MemberList({ community, members }: { community: string; members: GroupMember[] }) {
  const [rows, setRows] = useState(members)
  const [pending, setPending] = useState<string | null>(null)

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
      {rows.map((member) => (
        <li key={member.id} className="flex items-center gap-3 px-4 py-2.5 [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
          <Link href={`/${community}/profiles/${member.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={member.username} seed={member.id} />
            <span className="truncate text-[16px] font-semibold">{member.username}</span>
          </Link>
          {pending === member.id ? (
            <button type="button" className="max-w-36 text-right text-sm font-semibold text-danger" onClick={() => setRows((current) => current.filter((row) => row.id !== member.id))}>
              {t.groups.removeAsk}
            </button>
          ) : (
            <button type="button" aria-label={t.groups.remove} className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-danger/10 hover:text-danger" onClick={() => setPending(member.id)}>
              <Icon name="trash" className="size-5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
