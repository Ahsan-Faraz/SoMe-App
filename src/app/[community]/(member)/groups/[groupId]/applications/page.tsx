import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { requireAdmin } from '@/features/auth/queries'
import { RosterScreen } from '@/features/membership/components/RosterScreen'
import { getScope } from '@/features/membership/queries'

export default function GroupApplicationsPage(props: PageProps<'/[community]/groups/[groupId]/applications'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params }: PageProps<'/[community]/groups/[groupId]/applications'>) {
  const { community, groupId } = await params
  await requireAdmin(community)
  const scope = await getScope('group', community, groupId)
  if (!scope) notFound()

  return (
    <RosterScreen
      community={community}
      scope={scope}
      mode="applications"
      backHref={`/${community}/groups/${groupId}`}
      profileBase={`/${community}/groups/${groupId}/members`}
    />
  )
}
