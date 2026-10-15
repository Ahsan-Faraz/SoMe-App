import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireAdmin } from '@/features/auth/queries'
import { RosterStats } from '@/features/membership/components/RosterStats'
import { ScopeTitle } from '@/features/membership/components/RosterScreen'
import { getScope, listRoster } from '@/features/membership/queries'
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
  await requireAdmin(community)
  const scope = await getScope('group', community, groupId)
  if (!scope) notFound()
  const seed = await listRoster(community, scope)

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={<ScopeTitle scope={scope.name} title={t.admin.statistics} />} backHref={`/${community}/groups/${groupId}`} />
      <RosterStats community={community} scope={{ kind: scope.kind, id: scope.id, stateLabels: scope.stateLabels }} seed={seed} />
    </div>
  )
}
