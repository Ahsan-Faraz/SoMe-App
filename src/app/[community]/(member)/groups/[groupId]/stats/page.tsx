import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireMember } from '@/features/auth/queries'
import { RosterStats } from '@/features/membership/components/RosterStats'
import { ScopeTitle } from '@/features/membership/components/RosterScreen'
import { getScope, getScopeStats } from '@/features/membership/queries'
import { t } from '@/lib/i18n'

// A28: group statistics.
export default function GroupStatsPage(props: PageProps<'/[community]/groups/[groupId]/stats'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params }: PageProps<'/[community]/groups/[groupId]/stats'>) {
  const { community, groupId } = await params
  await requireMember(community)
  const [scope, stats] = await Promise.all([getScope('group', community, groupId), getScopeStats(community, { kind: 'group', id: groupId })])
  if (!scope || !stats) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={<ScopeTitle scope={scope.name} title={t.admin.statistics} />} backHref={`/${community}/groups/${groupId}`} />
      <RosterStats scope={{ stateLabels: scope.stateLabels }} stats={stats} />
    </div>
  )
}
