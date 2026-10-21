'use client'

import Link from 'next/link'
import { useEffect, useOptimistic, useState, useTransition } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { profilePhotoUrl } from '@/features/profiles/photo'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/browser'
import { setGroupMemberAction } from '../actions'

const SEARCH_DELAY_MS = 250
const SEARCH_LIMIT = 30

type Person = { id: string; username: string; icon: string | null }

// A30 "+": add community members to the group. The first page of the Profiles list to start, then
// the names matching what is typed (member_names: approved members, blocks respected). Adding saves
// at once (set_group_member) and shows at once; people already in the group are left out.
export function AddList({
  community,
  communityId,
  groupId,
  people,
  memberIds,
}: {
  community: string
  communityId: string
  groupId: string
  people: Person[]
  memberIds: string[]
}) {
  const [added, addOne] = useOptimistic(memberIds, (current, id: string) => [...current, id])
  const [, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ query: string; items: Person[] }>({ query: '', items: [] })
  const text = query.trim()

  // Search as you type, after a short pause; a slower, older answer never replaces a newer one.
  useEffect(() => {
    if (!text) return
    let current = true
    const timer = setTimeout(async () => {
      const { data } = await createClient().rpc('member_names', { p_community: communityId, p_query: text, p_limit: SEARCH_LIMIT })
      if (!current) return
      setFound({ query: text, items: (data ?? []).map((row) => ({ id: row.user_id, username: row.username, icon: row.icon ? profilePhotoUrl(row.icon) : null })) })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [communityId, text])

  const list = (text ? (found.query === text ? found.items : []) : people).filter((person) => !memberIds.includes(person.id))

  function add(person: Person) {
    setError('')
    startTransition(async () => {
      addOne(person.id)
      const result = await setGroupMemberAction(community, groupId, person.id, true)
      if (result) setError(result.error)
    })
  }

  return (
    <>
      <div className="px-4 py-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-rail px-3 text-ink focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" className="size-5" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.groups.filter}
            aria-label={t.groups.filter}
            className="h-full flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink/50"
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="px-4 pb-2 text-[14px] text-danger">
          {error}
        </p>
      ) : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
        {list.map((person) => {
          const chosen = added.includes(person.id)
          return (
            <li key={person.id} className="flex items-center gap-3 px-4 py-2.5 [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
              <Link href={`/${community}/profiles/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={person.username} seed={person.id} src={person.icon} />
                <span className="truncate text-[16px] font-semibold">{person.username}</span>
              </Link>
              <button
                type="button"
                aria-label={t.groups.add}
                disabled={chosen}
                onClick={() => add(person)}
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
