import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { AssignGroups } from '@/features/groups/components/AssignGroups'
import { listAssignments } from '@/features/groups/queries'
import { getProfile } from '@/features/profiles/queries'

export default function AssignGroupsPage(props: PageProps<'/[community]/profiles/[userId]/groups'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AssignGroupsContent {...props} />
    </Suspense>
  )
}

async function AssignGroupsContent({ params }: PageProps<'/[community]/profiles/[userId]/groups'>) {
  const { community, userId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'admin') redirect(`/${community}/profiles/${userId}`)

  const [profile, groups] = await Promise.all([getProfile(userId, viewer.userId, viewer.username), listAssignments(userId)])
  if (!profile || profile.own) notFound()

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={profile.username} backHref={`/${community}/profiles/${profile.id}`} />
      <AssignGroups storageKey={`some:assign:${community}:${profile.id}`} admitted groups={groups} />
    </div>
  )
}
