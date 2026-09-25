'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDeferredValue, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { formatChatTime } from '@/lib/format'
import { t } from '@/lib/i18n'
import type { ChatListItem } from '../types'

export function ChatList({ community, chats, now }: { community: string; chats: ChatListItem[]; now: number }) {
  const path = usePathname()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
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
          {visible.map((chat) => (
            <li key={chat.id} className="[contain-intrinsic-size:auto_68px] [content-visibility:auto]">
              <Link
                href={`/${community}/chats/${chat.id}`}
                aria-current={path === `/${community}/chats/${chat.id}` ? 'page' : undefined}
                className={`mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 ${
                  path === `/${community}/chats/${chat.id}` ? 'bg-accent/10' : 'hover:bg-black/[0.04]'
                }`}
              >
                <Avatar name={chat.name} seed={chat.id} shape={chat.kind === 'group' ? 'square' : 'circle'} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[16px] text-ink ${chat.unread > 0 ? 'font-bold' : 'font-semibold'}`}>
                      {chat.name}
                    </span>
                    <span className={`shrink-0 text-[13px] ${chat.unread > 0 ? 'font-semibold text-accent' : 'text-muted'}`}>
                      {formatChatTime(chat.lastMessageAt, now)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={`truncate text-[14px] ${chat.unread > 0 ? 'text-ink' : 'text-muted'}`}>
                      {chat.lastMessage ?? t.chats.noMessages}
                    </span>
                    {chat.unread > 0 ? (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-white">
                        {chat.unread}
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
