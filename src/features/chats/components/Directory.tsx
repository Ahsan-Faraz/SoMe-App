'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { ChipSelect } from '@/components/ui/FilterFields'
import { Icon } from '@/components/ui/Icon'
import type { CardLabels } from '@/features/profiles/cards'
import { profilePhotoUrl } from '@/features/profiles/photo'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/browser'
import type { DirectoryEntry } from '../types'

const kinds = [t.chats.users, t.chats.groups] as const
// find_new answers from 2 characters, after a short pause in typing.
const MIN_QUERY = 2
const SEARCH_DELAY_MS = 250

// A2 "Find new user/group": people you have no DM with and groups you are not in, whose name contains
// the text (find_new: visibility and blocks respected). Users / Groups is a multi-select filter.
// labels: Status and District names for the people's second line.
export function Directory({ community, communityId, labels }: { community: string; communityId: string; labels: CardLabels }) {
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState<string[]>([...kinds])
  const [found, setFound] = useState<{ key: string; entries: DirectoryEntry[] }>({ key: '', entries: [] })
  const text = query.trim()
  const users = shown.includes(t.chats.users)
  const groups = shown.includes(t.chats.groups)
  const key = `${text}|${users}|${groups}`
  const searching = text.length >= MIN_QUERY && (users || groups)

  // A slower, older answer never replaces a newer one.
  useEffect(() => {
    if (!searching) return
    let current = true
    const timer = setTimeout(async () => {
      const { data, error } = await createClient().rpc('find_new', { p_community: communityId, p_query: text, p_users: users, p_groups: groups })
      if (!current || error) return
      const back = encodeURIComponent(`/${community}/chats/new`)
      const label = (id: string | null) => (id ? (labels[id] ?? '') : '')
      setFound({
        key,
        entries: data.map((row) =>
          row.kind === 'user'
            ? {
                id: row.id,
                kind: 'user',
                name: row.name,
                detail: [label(row.status_id), row.place || label(row.district_id)].filter(Boolean).join(' · '),
                icon: row.icon ? profilePhotoUrl(row.icon) : null,
                href: `/${community}/profiles/${row.id}?back=${back}`,
              }
            : { id: row.id, kind: 'group', name: row.name, detail: row.headline ?? '', icon: null, href: `/${community}/groups/${row.id}/join` },
        ),
      })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [community, communityId, groups, key, labels, searching, text, users])

  const visible = searching && found.key === key ? found.entries : []

  return (
    <>
      <div className="grid gap-3 border-b border-line px-4 py-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-rail px-3 text-ink focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" className="size-5" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.chats.joinSearch}
            aria-label={t.chats.joinSearch}
            autoFocus
            className="h-full flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink/50"
          />
        </label>
        <div role="group" aria-label={t.profiles.filter}>
          <ChipSelect options={kinds} value={shown} onChange={setShown} />
        </div>
      </div>
      {text.length < MIN_QUERY ? (
        <p className="mx-auto max-w-sm px-6 py-10 text-center text-[15px] text-muted">{t.chats.joinHint}</p>
      ) : searching && found.key !== key ? null : visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-muted">{t.chats.joinEmpty}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] py-1">
          {visible.map((entry) => (
            <li key={entry.id} className="[contain-intrinsic-size:auto_60px] [content-visibility:auto]">
              <Link href={entry.href} className="mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-hover">
                <Avatar name={entry.name} seed={entry.id} shape={entry.kind === 'group' ? 'square' : 'circle'} src={entry.icon} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{entry.name}</span>
                  <span className="block truncate text-[14px] text-muted">{entry.detail}</span>
                </span>
                <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
