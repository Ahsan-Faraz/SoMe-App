import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireAdmin } from '@/features/auth/queries'
import { RosterStats } from '@/features/membership/components/RosterStats'
import { ScopeTitle } from '@/features/membership/components/RosterScreen'
import { getScope, getScopeStats } from '@/features/membership/queries'
import { t } from '@/lib/i18n'

// A33: community statistics.
export default function CommunityStatsPage(props: PageProps<'/[community]/admin/stats'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params }: PageProps<'/[community]/admin/stats'>) {
  const { community } = await params
  await requireAdmin(community)
  const [scope, stats] = await Promise.all([getScope('community', community), getScopeStats(community, { kind: 'community', id: 'community' })])
  if (!scope || !stats) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={<ScopeTitle scope={scope.name} title={t.admin.statistics} />} backHref={`/${community}/admin`} />
      <RosterStats scope={{ stateLabels: scope.stateLabels }} stats={stats} />
    </div>
  )
}
