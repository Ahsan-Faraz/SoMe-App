'use client'

import Link from 'next/link'
import { useDeferredValue, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { formatChatTime } from '@/lib/format'
import { t } from '@/lib/i18n'
import type { ChatListItem } from '../types'

export function ChatList({ community, chats, now }: { community: string; chats: ChatListItem[]; now: number }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const visible = deferredQuery ? chats.filter((chat) => chat.name.toLowerCase().includes(deferredQuery)) : chats

  return (
    <>
      <div className="px-4 py-3">
        <label className="flex h-10 items-center gap-2 rounded-full bg-neutral-100 px-4 text-neutral-500 focus-within:ring-2 focus-within:ring-accent/30">
          <Icon name="search" className="size-5" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.chats.search}
            aria-label={t.chats.search}
            className="h-full flex-1 bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-500"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-neutral-500">
          {deferredQuery ? t.chats.noMatch(query.trim()) : t.chats.empty}
        </p>
      ) : (
        <ul>
          {visible.map((chat) => (
            <li key={chat.id} className="[contain-intrinsic-size:auto_72px] [content-visibility:auto]">
              <Link
                href={`/${community}/chats/${chat.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
              >
                <Avatar name={chat.name} seed={chat.id} shape={chat.kind === 'group' ? 'square' : 'circle'} />
                <span className="min-w-0 flex-1 border-b border-neutral-100 pb-3">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${chat.unread > 0 ? 'font-semibold' : 'font-medium'}`}>{chat.name}</span>
                    <span className={`shrink-0 text-xs ${chat.unread > 0 ? 'text-accent' : 'text-neutral-400'}`}>
                      {formatChatTime(chat.lastMessageAt, now)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${chat.unread > 0 ? 'text-neutral-700' : 'text-neutral-500'}`}>
                      {chat.lastMessage ?? t.chats.noMessages}
                    </span>
                    {chat.unread > 0 ? (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white">
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
