import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { requireAdmin } from '@/features/auth/queries'
import { MemberProfileScreen } from '@/features/membership/components/MemberProfileScreen'
import { getScope } from '@/features/membership/queries'
import { backFrom } from '@/lib/back'

// A21: a member or applicant, seen by the community admin.
export default function CommunityMemberPage(props: PageProps<'/[community]/admin/members/[userId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params, searchParams }: PageProps<'/[community]/admin/members/[userId]'>) {
  const { community, userId } = await params
  const viewer = await requireAdmin(community)
  const scope = await getScope('community', community)
  if (!scope) notFound()
  const base = `/${community}/admin/members`

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
