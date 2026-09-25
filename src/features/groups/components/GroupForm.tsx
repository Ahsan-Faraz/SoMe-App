'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { GroupForm as GroupValues } from '../types'

const blank: GroupValues = {
  id: '',
  name: '',
  headline: '',
  calendar: true,
  history: true,
  memberList: true,
  editPosts: true,
  directJoin: false,
}

export function GroupForm({ community, group }: { community: string; group: GroupValues | null }) {
  const router = useRouter()
  const editing = group !== null
  const [values, setValues] = useState(group ?? blank)
  const [infos, setInfos] = useState(['', '', '', '', '', ''])

  function setFlag(key: 'calendar' | 'history' | 'memberList' | 'editPosts' | 'directJoin', checked: boolean) {
    setValues((current) => ({ ...current, [key]: checked }))
  }

  return (
    <form
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4 px-4 py-4 sm:px-8 min-[64rem]:px-12"
      onSubmit={(event) => {
        event.preventDefault()
        router.push(editing ? `/${community}/chats/${group.id}` : `/${community}/chats`)
      }}
    >
      <label className="col-span-full grid gap-1.5 text-[14px] font-semibold text-ink">
        {t.groups.name}
        <input
          required
          value={values.name}
          onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
          className="h-11 rounded-xl border border-black/15 bg-canvas px-3 text-[16px] font-normal text-ink outline-none focus:border-accent"
        />
      </label>
      <label className="flex items-center gap-2.5 text-[16px] font-medium">
        <input type="checkbox" checked={values.calendar} onChange={(event) => setFlag('calendar', event.target.checked)} />
        {t.groups.calendar}
      </label>
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid gap-2">
          <label className="grid gap-1.5 text-[14px] font-semibold text-ink">
            {t.groups.infoHeader(index + 1)}
            <input
              value={infos[index * 2] ?? ''}
              onChange={(event) => setInfos((current) => current.map((item, i) => (i === index * 2 ? event.target.value : item)))}
              className="h-11 rounded-xl border border-black/15 bg-canvas px-3 text-[16px] font-normal text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="grid gap-1.5 text-[14px] font-semibold text-ink">
            {t.groups.infoText(index + 1)}
            <textarea
              rows={2}
              value={infos[index * 2 + 1] ?? ''}
              onChange={(event) => setInfos((current) => current.map((item, i) => (i === index * 2 + 1 ? event.target.value : item)))}
              className="rounded-xl border border-black/15 bg-canvas px-3 py-2 text-[16px] font-normal text-ink outline-none focus:border-accent"
            />
          </label>
        </div>
      ))}
      {(
        [
          ['history', t.groups.history],
          ['memberList', t.groups.memberList],
          ['editPosts', t.groups.editPosts],
          ['directJoin', t.groups.directJoin],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center gap-2.5 text-[16px] font-medium">
          <input type="checkbox" checked={values[key]} onChange={(event) => setFlag(key, event.target.checked)} />
          {label}
        </label>
      ))}
      {editing ? (
        <Link href={`/${community}/groups/${group.id}/members`} className="text-[16px] font-semibold text-accent hover:underline">
          {t.groups.users}
        </Link>
      ) : null}
      <label className="col-span-full grid gap-1.5 text-[14px] font-semibold text-ink">
        {t.groups.headline}
        <input
          value={values.headline}
          onChange={(event) => setValues((current) => ({ ...current, headline: event.target.value }))}
          className="h-11 rounded-xl border border-black/15 bg-canvas px-3 text-[16px] font-normal text-ink outline-none focus:border-accent"
        />
      </label>
      <Button type="submit" className="col-span-full max-w-sm">{editing ? t.groups.edit : t.groups.save}</Button>
      {editing ? (
        <Button variant="ghost" className="col-span-full max-w-sm !text-danger" onClick={() => router.push(`/${community}/chats`)}>
          {t.groups.delete}
        </Button>
      ) : null}
    </form>
  )
}
