import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { requireAdmin } from '@/features/auth/queries'
import { MemberProfileScreen } from '@/features/membership/components/MemberProfileScreen'
import { getScope } from '@/features/membership/queries'
import { backFrom } from '@/lib/back'

// A22: a member or applicant, seen by the group admin.
export default function GroupMemberPage(props: PageProps<'/[community]/groups/[groupId]/members/[userId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params, searchParams }: PageProps<'/[community]/groups/[groupId]/members/[userId]'>) {
  const { community, groupId, userId } = await params
  const viewer = await requireAdmin(community)
  const scope = await getScope('group', community, groupId)
  if (!scope) notFound()
  const base = `/${community}/groups/${groupId}/members`

  return (
    <MemberProfileScreen
      community={community}
      viewer={viewer}
      scope={scope}
      userId={userId}
      base={base}
      backHref={backFrom((await searchParams).back, community, base)}
    />
  )
}
