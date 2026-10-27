import { t } from '@/lib/i18n'
import type { Scope, ScopeStats } from '../types'

// A28 group / A33 community statistics: member count, members per status, and the sum of each
// profile-state number (e.g. Paid 300, Attended 32). Counted in the database over the whole scope.
export function RosterStats({ scope, stats }: { scope: Pick<Scope, 'stateLabels'>; stats: ScopeStats }) {
  return (
    <div className="mx-auto grid max-w-xl gap-6 px-4 py-6 sm:px-8">
      <dl className="flex items-baseline justify-between rounded-2xl bg-sunken px-4 py-4">
        <dt className="text-[17px] font-semibold">{t.membership.total}</dt>
        <dd className="text-[28px] leading-none font-bold tabular-nums">{stats.members}</dd>
      </dl>
      <Table title={t.membership.byStatus} rows={stats.byStatus} />
      <Table title={t.membership.sums} rows={scope.stateLabels.flatMap((label, index) => (label ? [[label, stats.sums[index] ?? 0] as [string, number]] : []))} />
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
