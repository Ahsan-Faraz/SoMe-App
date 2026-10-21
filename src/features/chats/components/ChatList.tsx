'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { formatChatTime } from '@/lib/format'
import { t } from '@/lib/i18n'
import type { ChatListItem } from '../types'

// A1. The list is the server's (chat_list: unread first, then newest). It reloads when the app comes
// back to the screen and when the list is shown again after another page; there is no live channel
// for the list (docs/backend-design.md §8). The chat that is open (desktop) shows no unread number.
export function ChatList({ community, chats, now }: { community: string; chats: ChatListItem[]; now: number }) {
  const path = usePathname()
  const router = useRouter()
  const shown = useRef(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  // Pages stay alive between visits (Activity): this runs again each time the list is shown.
  useEffect(() => {
    if (shown.current) router.refresh()
    shown.current = true
    const onVisibility = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [router])

  const visible = deferredQuery ? chats.filter((chat) => chat.name.toLowerCase().includes(deferredQuery)) : chats

  return (
    <>
      <div className="px-4 py-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-rail px-3 text-ink focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" className="size-5" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.chats.search}
            aria-label={t.chats.search}
            className="h-full flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink/50"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-muted">
          {deferredQuery ? t.chats.noMatch(query.trim()) : t.chats.empty}
        </p>
      ) : (
        <ul>
          {visible.map((chat) => {
            const current = path === `/${community}/chats/${chat.id}`
            const unread = current ? 0 : chat.unread
            return (
              <li key={chat.id} className="[contain-intrinsic-size:auto_68px] [content-visibility:auto]">
                <Link
                  href={`/${community}/chats/${chat.id}`}
                  aria-current={current ? 'page' : undefined}
                  className={`mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 ${current ? 'bg-accent/10' : 'hover:bg-hover'}`}
                >
                  <Avatar name={chat.name} seed={chat.id} shape={chat.kind === 'group' ? 'square' : 'circle'} src={chat.icon} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[16px] text-ink ${unread > 0 ? 'font-bold' : 'font-semibold'}`}>{chat.name}</span>
                      <span className={`shrink-0 text-[13px] ${unread > 0 ? 'font-semibold text-accent' : 'text-muted'}`}>
                        {formatChatTime(chat.lastMessageAt, now)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={`truncate text-[14px] ${unread > 0 ? 'text-ink' : 'text-muted'}`}>{chat.lastMessage ?? t.chats.noMessages}</span>
                      {unread > 0 ? (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-white">
                          {unread}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
