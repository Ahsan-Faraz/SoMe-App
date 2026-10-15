'use client'

import { useMemo } from 'react'
import { t } from '@/lib/i18n'
import { useRoster } from '../storage'
import type { Roster, Scope } from '../types'

// A28 group / A33 community statistics: member count, members per status, and the sum of each
// profile-state number (e.g. Paid 300, Attended 32). Follows edits made in the member list.
export function RosterStats({ community, scope, seed }: { community: string; scope: Pick<Scope, 'kind' | 'id' | 'stateLabels'>; seed: Roster }) {
  const { members } = useRoster(community, scope, seed)

  const { byStatus, sums } = useMemo(() => {
    const counts = new Map<string, number>()
    const totals = scope.stateLabels.map(() => 0)
    for (const member of members) {
      const status = member.status || t.membership.noStatus
      counts.set(status, (counts.get(status) ?? 0) + 1)
      member.state.forEach((value, index) => {
        const number = Number.parseInt(value, 10)
        if (Number.isFinite(number) && index < totals.length) totals[index] = (totals[index] ?? 0) + number
      })
    }
    return { byStatus: [...counts].sort((a, b) => b[1] - a[1]), sums: totals }
  }, [members, scope.stateLabels])

  return (
    <div className="mx-auto grid max-w-xl gap-6 px-4 py-6 sm:px-8">
      <dl className="flex items-baseline justify-between rounded-2xl bg-sunken px-4 py-4">
        <dt className="text-[17px] font-semibold">{t.membership.total}</dt>
        <dd className="text-[28px] leading-none font-bold tabular-nums">{members.length}</dd>
      </dl>
      <Table title={t.membership.byStatus} rows={byStatus} />
      <Table title={t.membership.sums} rows={scope.stateLabels.flatMap((label, index) => (label ? [[label, sums[index] ?? 0] as [string, number]] : []))} />
    </div>
  )
}

function Table({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[13px] font-bold tracking-wide text-muted uppercase">{title}</h2>
      <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3 text-[16px]">
            <dt>{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
