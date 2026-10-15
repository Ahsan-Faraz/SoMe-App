'use client'

import { useOptimistic, useState, useTransition, type ReactNode } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { GrowingTextarea } from '@/components/ui/GrowingTextarea'
import type { StatusChoice } from '@/features/fields/types'
import { setMemberStatusAction } from '@/features/profiles/actions'
import { t } from '@/lib/i18n'
import { saveMember } from '../save'
import { useMember, wholeNumber } from '../storage'
import { REAL_NAMES, type MemberRecord, type RosterEdit, type Scope } from '../types'

type ScopeRef = Pick<Scope, 'kind' | 'id' | 'stateLabels'>

const field = 'h-11 w-full min-w-0 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] text-ink outline-none focus:border-accent'
const label = 'grid min-w-0 gap-1.5 text-[14px] font-semibold text-ink'

// A21 (community) / A22 (group): the application and this scope's member data, under the usual profile.
// Saved separately per scope; each field is saved when it is left.
export function MemberPanel({
  community,
  scope,
  seed,
  statusId,
  statuses,
}: {
  community: string
  scope: ScopeRef
  seed: MemberRecord
  statusId: string | null // the member's Status, from their profile
  statuses: readonly StatusChoice[]
}) {
  const record = useMember(community, scope, seed)
  if (!record) return null
  // Re-seed the inputs when this device's saved values arrive after first paint.
  return (
    <PanelFields
      key={`${record.realNames.join('|')}|${record.state.join('|')}|${record.notes}`}
      community={community}
      scope={scope}
      record={record}
      labels={scope.stateLabels}
      // Status is locked for the member: only the community admin (not a group admin) can change it.
      status={scope.kind === 'community' ? <StatusEditor community={community} userId={record.userId} statusId={statusId} statuses={statuses} /> : null}
    />
  )
}

// Saved when picked (set_member_status checks the admin role); the profile above then shows that
// Status's fields. Shown at once, back to the saved one if the save fails.
function StatusEditor({ community, userId, statusId, statuses }: { community: string; userId: string; statusId: string | null; statuses: readonly StatusChoice[] }) {
  const [shown, setShown] = useOptimistic(statusId ?? '')
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()
  return (
    <label className={label}>
      {t.profiles.statusAdmin}
      <select
        value={shown}
        onChange={(event) => {
          const next = event.target.value
          setError('')
          startTransition(async () => {
            setShown(next)
            const result = await setMemberStatusAction(community, userId, next)
            if (result) setError(result.error)
          })
        }}
        className={field}
      >
        {shown ? null : <option value="">{t.profiles.choose}</option>}
        {statuses
          .filter((item) => item.active || item.id === statusId)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
      </select>
      <span className={`text-[13px] font-normal ${error ? 'text-danger' : 'text-muted'}`}>{error || t.profiles.statusAdminHint}</span>
    </label>
  )
}

// Each field is saved when it is left: the community's in the database, a group's on this device.
function PanelFields({
  community,
  scope,
  record,
  labels,
  status,
}: {
  community: string
  scope: ScopeRef
  record: MemberRecord
  labels: string[]
  status: ReactNode
}) {
  const [names, setNames] = useState(() => Array.from({ length: REAL_NAMES }, (_, i) => record.realNames[i] ?? ''))
  const [state, setState] = useState(record.state)
  const [notes, setNotes] = useState(record.notes)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()
  const same = (a: string[], b: string[]) => a.join('|') === b.join('|')
  const save = (edit: RosterEdit) => {
    setError('')
    startTransition(async () => setError((await saveMember(community, scope, record, edit)) ?? ''))
  }

  return (
    <section className="grid gap-5 rounded-2xl border border-line p-4 sm:p-5 min-[52rem]:grid-cols-2 min-[52rem]:gap-x-10">
      <div className="grid content-start gap-2">
        <h2 className="text-[14px] font-semibold">{t.membership.applicationImage}</h2>
        {record.image ? (
          <figure>
            {/* A signed URL (private bucket, community) or a data URL (groups, until step 7). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={record.image.src} alt={t.membership.applicationImage} loading="lazy" decoding="async" className="h-auto max-h-[70dvh] w-full rounded-xl bg-sunken object-contain" />
            <figcaption className={`mt-1 text-[13px] ${record.image.verified ? 'font-semibold text-accent' : 'text-muted'}`}>
              {record.image.verified ? `✓ ${t.chats.takenInApp} · ${record.image.date}` : record.image.date}
            </figcaption>
          </figure>
        ) : (
          <p className="rounded-xl bg-sunken px-4 py-6 text-center text-[15px] text-muted">{t.membership.noImage}</p>
        )}
        <h2 className="mt-3 text-[14px] font-semibold">{t.membership.applicationMessage}</h2>
        <p className="text-[16px] leading-relaxed whitespace-pre-wrap text-ink-soft">{record.message || '—'}</p>
      </div>
      <div className="grid content-start gap-4">
        {status}
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1.5 text-[14px] font-semibold">{t.membership.realNames}</legend>
          {names.map((name, index) => (
            <input
              key={index}
              value={name}
              aria-label={t.membership.realName(index + 1)}
              placeholder={`${index + 1}`}
              onChange={(event) => setNames((current) => current.map((item, i) => (i === index ? event.target.value : item)))}
              onBlur={() => !same(names, record.realNames) && save({ realNames: names })}
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
                  onBlur={() => !same(state, record.state) && save({ state })}
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
            onBlur={() => notes !== record.notes && save({ notes })}
            className="rounded-xl border border-line-strong bg-canvas px-3 py-2.5 text-[16px] leading-normal font-normal text-ink outline-none focus:border-accent"
          />
        </label>
        {error ? (
          <p role="alert" className="text-[14px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}

// Approve = add to the community or group and take it off the applications list. Gone once approved.
// The community's approval is saved in the database and emails the member.
export function ApproveButton({ community, scope, seed }: { community: string; scope: ScopeRef; seed: MemberRecord }) {
  const record = useMember(community, scope, seed)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  if (done) {
    return (
      <p role="status" className="rounded-xl bg-accent/10 px-4 py-3 text-center text-[15px] font-semibold text-accent">
        {scope.kind === 'community' ? t.membership.approvedMail : t.membership.approved}
      </p>
    )
  }
  if (!record?.applied) return null
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={`${buttonClass('primary')} disabled:opacity-50`}
        onClick={() =>
          startTransition(async () => {
            const failed = await saveMember(community, scope, record, { approved: true })
            if (failed) setError(failed)
            else setDone(true)
          })
        }
      >
        {t.membership.approve}
      </button>
      {error ? (
        <p role="alert" className="text-center text-[14px] text-danger">
          {error}
        </p>
      ) : null}
    </>
  )
}
