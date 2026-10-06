import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { requireAdmin } from '@/features/auth/queries'
import { RosterScreen } from '@/features/membership/components/RosterScreen'
import { getScope } from '@/features/membership/queries'

export default function GroupMembersPage(props: PageProps<'/[community]/groups/[groupId]/members'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params }: PageProps<'/[community]/groups/[groupId]/members'>) {
  const { community, groupId } = await params
  await requireAdmin(community)
  const scope = await getScope('group', community, groupId)
  if (!scope) notFound()

  return (
    <RosterScreen
      community={community}
      scope={scope}
      mode="members"
      backHref={`/${community}/groups/${groupId}`}
      profileBase={`/${community}/groups/${groupId}/members`}
      addHref={`/${community}/groups/${groupId}/add`}
    />
  )
}
