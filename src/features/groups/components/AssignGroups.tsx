'use client'

import { useOptimistic, useState, useTransition, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { approveApplicationAction, removeMemberAction } from '@/features/membership/actions'
import { t } from '@/lib/i18n'
import { setGroupAdminAction, setGroupMemberAction, setGroupRightsAction } from '../actions'

type GroupRow = { id: string; name: string; member: boolean; admin: boolean }

// The community admin's settings for this member: community membership (an open application to
// approve, or removal) and group-create rights (D9). Null for a group admin.
export type MemberSettings = { member: boolean; applicationId: string | null; canCreateGroups: boolean }

// F1 "Add to groups". Community admin: the settings and every group. Group admin: only the groups
// they run (the database lists just those). Each tick is saved at once and shown at once; it goes
// back if the database refuses it. The community admin also picks who runs each group ("Make admin").
export function AssignGroups({ community, userId, settings, groups }: { community: string; userId: string; settings: MemberSettings | null; groups: GroupRow[] }) {
  const [shownGroups, setGroup] = useOptimistic(groups, (current, change: Pick<GroupRow, 'id'> & Partial<GroupRow>) =>
    current.map((group) => (group.id === change.id ? { ...group, ...change } : group)),
  )
  const [shownSettings, setSetting] = useOptimistic(settings, (current, change: Partial<MemberSettings>) => (current ? { ...current, ...change } : current))
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  const run = (apply: () => void, save: () => Promise<{ error: string } | undefined>) => {
    setError('')
    startTransition(async () => {
      apply()
      const result = await save()
      if (result) setError(result.error)
    })
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-8 px-4 pt-6 pb-10 sm:px-8">
      {error ? (
        <p role="alert" className="-mb-4 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      {shownSettings ? (
        <Section title={t.groups.settings}>
          <Row
            label={t.groups.communityMember}
            checked={shownSettings.member}
            // On: approve their open application. Off: remove them from the community (asked first).
            disabled={shownSettings.member ? false : !shownSettings.applicationId}
            onChange={(member) => {
              if (member && shownSettings.applicationId) {
                const applicationId = shownSettings.applicationId
                run(() => setSetting({ member: true }), () => approveApplicationAction(community, applicationId))
              } else if (!member && window.confirm(t.groups.removeConfirm)) {
                run(() => setSetting({ member: false }), () => removeMemberAction(community, userId))
              }
            }}
          />
          <Row
            label={t.groups.groupAdmin}
            checked={shownSettings.canCreateGroups}
            onChange={(canCreateGroups) => run(() => setSetting({ canCreateGroups }), () => setGroupRightsAction(community, userId, canCreateGroups))}
          />
        </Section>
      ) : null}
      <Section title={t.groups.addToGroups}>
        {shownGroups.map((group) => (
          <Row
            key={group.id}
            label={group.name}
            checked={group.member}
            // The group admin can't be taken out (the database refuses it too): another admin first.
            locked={group.admin}
            onChange={(member) => run(() => setGroup({ id: group.id, member }), () => setGroupMemberAction(community, group.id, userId, member))}
            icon={<Avatar name={group.name} seed={group.id} size="sm" shape="square" />}
            extra={
              group.admin ? (
                <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[13px] font-semibold text-accent">{t.groups.runsGroup}</span>
              ) : shownSettings ? (
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-line-strong px-2.5 py-1 text-[13px] font-semibold text-ink hover:bg-hover"
                  onClick={(event) => {
                    event.preventDefault()
                    if (window.confirm(t.groups.makeAdminConfirm(group.name))) {
                      run(() => setGroup({ id: group.id, member: true, admin: true }), () => setGroupAdminAction(community, group.id, userId))
                    }
                  }}
                >
                  {t.groups.makeAdmin}
                </button>
              ) : null
            }
          />
        ))}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[22px] font-bold">{title}</h2>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">{children}</ul>
    </section>
  )
}

function Row({
  label,
  checked,
  onChange,
  icon,
  extra,
  disabled = false,
  locked = false,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  icon?: ReactNode
  extra?: ReactNode
  disabled?: boolean // dimmed and fixed
  locked?: boolean // fixed, not dimmed
}) {
  return (
    <li>
      <label className={`flex min-h-14 items-center gap-3 px-4 py-2 ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-hover'}`}>
        {icon}
        <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{label}</span>
        {extra}
        <input type="checkbox" checked={checked} disabled={disabled || locked} onChange={(event) => onChange(event.target.checked)} />
      </label>
    </li>
  )
}
