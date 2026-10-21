import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { requireMember } from '@/features/auth/queries'
import { RosterScreen } from '@/features/membership/components/RosterScreen'
import { getScope, listRoster } from '@/features/membership/queries'

export default function GroupMembersPage(props: PageProps<'/[community]/groups/[groupId]/members'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params }: PageProps<'/[community]/groups/[groupId]/members'>) {
  const { community, groupId } = await params
  await requireMember(community)
  const [scope, seed] = await Promise.all([getScope('group', community, groupId), listRoster(community, 'group', groupId)])
  if (!scope) notFound()

  return (
    <RosterScreen
      community={community}
      scope={scope}
      seed={seed}
      mode="members"
      backHref={`/${community}/groups/${groupId}`}
      profileBase={`/${community}/groups/${groupId}/members`}
      addHref={`/${community}/groups/${groupId}/add`}
    />
  )
}
