'use client'

import { useState } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { GrowingTextarea } from '@/components/ui/GrowingTextarea'
import { t } from '@/lib/i18n'
import { editMember, rosterKey, useMember, wholeNumber } from '../storage'
import { REAL_NAMES, type MemberRecord, type Scope } from '../types'

type ScopeRef = Pick<Scope, 'kind' | 'id' | 'stateLabels'>

const field = 'h-11 w-full min-w-0 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] text-ink outline-none focus:border-accent'
const label = 'grid min-w-0 gap-1.5 text-[14px] font-semibold text-ink'

// A21 (community) / A22 (group): the application and this scope's member data, under the usual profile.
// Saved separately per scope; each field is saved when it is left.
export function MemberPanel({ community, scope, seed }: { community: string; scope: ScopeRef; seed: MemberRecord }) {
  const record = useMember(community, scope, seed)
  if (!record) return null
  // Re-seed the inputs when this device's saved values arrive after first paint.
  return <PanelFields key={`${record.realNames.join('|')}|${record.state.join('|')}|${record.notes}`} storageKey={rosterKey(community, scope)} record={record} labels={scope.stateLabels} />
}

function PanelFields({ storageKey, record, labels }: { storageKey: string; record: MemberRecord; labels: string[] }) {
  const [names, setNames] = useState(() => Array.from({ length: REAL_NAMES }, (_, i) => record.realNames[i] ?? ''))
  const [state, setState] = useState(record.state)
  const [notes, setNotes] = useState(record.notes)
  const same = (a: string[], b: string[]) => a.join('|') === b.join('|')

  return (
    <section className="grid gap-5 rounded-2xl border border-line p-4 sm:p-5 min-[52rem]:grid-cols-2 min-[52rem]:gap-x-10">
      <div className="grid content-start gap-2">
        <h2 className="text-[14px] font-semibold">{t.membership.applicationImage}</h2>
        {record.image ? (
          <figure>
            {/* A captured or uploaded data URL, or a static path. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={record.image.src} alt={t.membership.applicationImage} loading="lazy" decoding="async" className="aspect-video w-full rounded-xl object-cover" />
            <figcaption className={`mt-1 text-[13px] ${record.image.verified ? 'font-semibold text-accent' : 'text-muted'}`}>
              {record.image.verified ? `✓ ${t.chats.verified} · ${record.image.date}` : record.image.date}
            </figcaption>
          </figure>
        ) : (
          <p className="rounded-xl bg-sunken px-4 py-6 text-center text-[15px] text-muted">{t.membership.noImage}</p>
        )}
        <h2 className="mt-3 text-[14px] font-semibold">{t.membership.applicationMessage}</h2>
        <p className="text-[16px] leading-relaxed whitespace-pre-wrap text-ink-soft">{record.message || '—'}</p>
      </div>
      <div className="grid content-start gap-4">
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1.5 text-[14px] font-semibold">{t.membership.realNames}</legend>
          {names.map((name, index) => (
            <input
              key={index}
              value={name}
              aria-label={t.membership.realName(index + 1)}
              placeholder={`${index + 1}`}
              onChange={(event) => setNames((current) => current.map((item, i) => (i === index ? event.target.value : item)))}
              onBlur={() => !same(names, record.realNames) && editMember(storageKey, record.userId, { realNames: names })}
              className={field}
            />
          ))}
        </fieldset>
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="mb-1.5 text-[14px] font-semibold">{t.membership.profileState}</legend>
          {labels.map((text, index) =>
            text ? (
              <label key={index} className="grid min-w-0 gap-1 text-[13px] font-semibold text-muted">
                <span className="truncate">{text}</span>
                <input
                  inputMode="numeric"
                  value={state[index] ?? ''}
                  onChange={(event) => setState((current) => current.map((item, i) => (i === index ? wholeNumber(event.target.value) : item)))}
                  onBlur={() => !same(state, record.state) && editMember(storageKey, record.userId, { state })}
                  className={`${field} text-center`}
                />
              </label>
            ) : null,
          )}
        </fieldset>
        <label className={label}>
          {t.membership.notes}
          <GrowingTextarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => notes !== record.notes && editMember(storageKey, record.userId, { notes })}
            className="rounded-xl border border-line-strong bg-canvas px-3 py-2.5 text-[16px] leading-normal font-normal text-ink outline-none focus:border-accent"
          />
        </label>
      </div>
    </section>
  )
}

// Approve = add to the community or group and take it off the applications list. Gone once approved.
export function ApproveButton({ community, scope, seed }: { community: string; scope: ScopeRef; seed: MemberRecord }) {
  const record = useMember(community, scope, seed)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <p role="status" className="rounded-xl bg-accent/10 px-4 py-3 text-center text-[15px] font-semibold text-accent">
        {scope.kind === 'community' ? t.membership.approvedMail : t.membership.approved}
      </p>
    )
  }
  if (!record?.applied) return null
  return (
    <button
      type="button"
      className={buttonClass('primary')}
      onClick={() => {
        editMember(rosterKey(community, scope), record.userId, { approved: true })
        setDone(true)
      }}
    >
      {t.membership.approve}
    </button>
  )
}
