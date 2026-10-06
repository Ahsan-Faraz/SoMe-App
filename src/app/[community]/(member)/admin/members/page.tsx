import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { requireAdmin } from '@/features/auth/queries'
import { RosterScreen } from '@/features/membership/components/RosterScreen'
import { getScope } from '@/features/membership/queries'

export default function CommunityMembersPage(props: PageProps<'/[community]/admin/members'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params }: PageProps<'/[community]/admin/members'>) {
  const { community } = await params
  await requireAdmin(community)
  const scope = await getScope('community', community)
  if (!scope) notFound()

  return (
    <RosterScreen
      community={community}
      scope={scope}
      mode="members"
      backHref={`/${community}/admin`}
      profileBase={`/${community}/admin/members`}
    />
  )
}
