'use client'

import { useRouter } from 'next/navigation'
import { useGoBack } from '@/lib/history'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { BigLink } from '@/components/ui/BigLink'
import { t } from '@/lib/i18n'
import type { GroupFlag, GroupForm as GroupValues } from '../types'

const STATE_LABELS = 3

const blank: GroupValues = {
  id: '',
  name: '',
  headline: '',
  applicationText: '',
  stateLabels: ['', '', ''],
  visibleInSearch: true,
  applyImage: false,
  applyText: true,
  applyNames: false,
  calendar: true,
  history: true,
  memberList: true,
  editPosts: true,
  directJoin: false,
  posting: true,
  commenting: true,
  reactions: true,
}

const flags: [GroupFlag, string][] = [
  ['visibleInSearch', t.groups.visibleInSearch],
  ['history', t.groups.history],
  ['memberList', t.groups.memberList],
  ['posting', t.groups.posting],
  ['commenting', t.groups.commenting],
  ['reactions', t.groups.reactions],
  ['editPosts', t.groups.editPosts],
  ['directJoin', t.groups.directJoin],
  ['calendar', t.groups.calendar],
]

const requirements: [GroupFlag, string][] = [
  ['applyImage', t.groups.applyImage],
  ['applyText', t.groups.applyTextField],
  ['applyNames', t.groups.applyNames],
]

const field = 'rounded-xl border border-line-strong bg-canvas px-3 text-[16px] font-normal text-ink outline-none placeholder:text-muted focus:border-accent'
const label = 'grid gap-1.5 text-[14px] font-semibold text-ink'
const heading = 'col-span-full mt-2 text-[13px] font-bold tracking-wide text-muted uppercase'

export function GroupForm({ community, group, infos: seedInfos }: { community: string; group: GroupValues | null; infos: string[] }) {
  const router = useRouter()
  const goBack = useGoBack(community)
  const editing = group !== null
  const [values, setValues] = useState(group ?? blank)
  const [infos, setInfos] = useState(() => Array.from({ length: 6 }, (_, i) => seedInfos[i] ?? ''))
  const set = <K extends keyof GroupValues>(key: K, value: GroupValues[K]) => setValues((current) => ({ ...current, [key]: value }))
  const base = editing ? `/${community}/groups/${group.id}` : ''

  return (
    <form
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4 px-4 py-4 pb-10 sm:px-8 min-[64rem]:px-12"
      onSubmit={(event) => {
        event.preventDefault()
        goBack(editing ? `/${community}/chats/${group.id}/info` : `/${community}/chats`)
      }}
    >
      <label className={`col-span-full ${label}`}>
        {t.groups.name}
        <input required value={values.name} onChange={(event) => set('name', event.target.value)} className={`${field} h-11`} />
      </label>
      <label className={`col-span-full ${label}`}>
        {t.groups.headline}
        <input value={values.headline} onChange={(event) => set('headline', event.target.value)} className={`${field} h-11`} />
      </label>
      <label className={`col-span-full ${label}`}>
        {t.groups.applicationText}
        <textarea rows={3} value={values.applicationText} onChange={(event) => set('applicationText', event.target.value)} className={`${field} py-2`} />
        <span className="text-[13px] font-normal text-muted">{t.groups.applicationHint}</span>
      </label>
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid content-start gap-2">
          <label className={label}>
            {t.groups.infoHeader(index + 1)}
            <input
              value={infos[index * 2] ?? ''}
              onChange={(event) => setInfos((current) => current.map((item, i) => (i === index * 2 ? event.target.value : item)))}
              className={`${field} h-11`}
            />
          </label>
          <label className={label}>
            {t.groups.infoText(index + 1)}
            <textarea
              rows={2}
              value={infos[index * 2 + 1] ?? ''}
              onChange={(event) => setInfos((current) => current.map((item, i) => (i === index * 2 + 1 ? event.target.value : item)))}
              className={`${field} py-2`}
            />
          </label>
        </div>
      ))}

      <h2 className={heading}>{t.groups.stateLabels}</h2>
      <div className="col-span-full grid gap-2 sm:grid-cols-3">
        {Array.from({ length: STATE_LABELS }, (_, index) => (
          <input
            key={index}
            value={values.stateLabels[index] ?? ''}
            onChange={(event) => set('stateLabels', Array.from({ length: STATE_LABELS }, (_, i) => (i === index ? event.target.value : (values.stateLabels[i] ?? ''))))}
            placeholder={t.groups.stateExamples[index]}
            aria-label={t.groups.stateLabel(index + 1)}
            className={`${field} h-11`}
          />
        ))}
      </div>

      <div className="col-span-full mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {flags.map(([key, text]) => (
          <label key={key} className="flex min-h-8 items-center gap-2.5 text-[16px] font-medium">
            <input type="checkbox" checked={values[key]} onChange={(event) => set(key, event.target.checked)} />
            {text}
          </label>
        ))}
      </div>

      {values.directJoin ? null : (
        <fieldset className="col-span-full rounded-2xl bg-sunken p-4">
          <legend className="float-left mb-3 w-full text-[14px] font-semibold">{t.groups.applyRequires}</legend>
          <div className="clear-left grid gap-3 sm:grid-cols-3">
            {requirements.map(([key, text]) => (
              <label key={key} className="flex items-center gap-2.5 text-[16px] font-medium">
                <input type="checkbox" checked={values[key]} onChange={(event) => set(key, event.target.checked)} />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {editing ? (
        <nav aria-label={group.name} className="col-span-full mt-2 grid gap-2 sm:grid-cols-3">
          <BigLink href={`${base}/stats`} icon="chart" label={t.groups.stats} />
          <BigLink href={`${base}/members`} icon="users" label={t.groups.memberListLink} />
          <BigLink href={`${base}/applications`} icon="inbox" label={t.groups.applications} />
        </nav>
      ) : null}

      <div className="col-span-full mt-2 grid max-w-sm gap-2">
        <Button type="submit">{editing ? t.groups.update : t.groups.save}</Button>
        {editing ? (
          <Button variant="ghost" className="text-danger!" onClick={() => router.replace(`/${community}/chats`)}>
            {t.groups.delete}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
