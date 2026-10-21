import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireMember } from '@/features/auth/queries'
import { AssignGroups } from '@/features/groups/components/AssignGroups'
import { listAssignments } from '@/features/groups/queries'
import { getMemberRecord, getScope } from '@/features/membership/queries'
import { getProfile } from '@/features/profiles/queries'

// F1 "Add to groups" for one member, by role: the community admin gets the settings (community
// member, group-create rights) and every group; a group admin only the groups they run.
export default function AssignGroupsPage(props: PageProps<'/[community]/profiles/[userId]/groups'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AssignGroupsContent {...props} />
    </Suspense>
  )
}

async function AssignGroupsContent({ params }: PageProps<'/[community]/profiles/[userId]/groups'>) {
  const { community, userId } = await params
  const viewer = await requireMember(community)
  const admin = viewer.role === 'admin'

  const [profile, assignments, record] = await Promise.all([
    getProfile(community, userId),
    listAssignments(community, userId),
    // The community record (open application) for the "Community member" setting.
    admin ? getScope('community', community).then((scope) => (scope ? getMemberRecord(community, scope, userId) : null)) : null,
  ])
  if (!profile || profile.own) notFound()
  if (!admin && assignments.groups.length === 0) redirect(`/${community}/profiles/${userId}`)

  const settings =
    admin && assignments.canCreateGroups !== null
      ? { member: profile.state === 'approved', applicationId: record?.applicationId ?? null, canCreateGroups: assignments.canCreateGroups }
      : null

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={profile.username} backHref={`/${community}/profiles/${profile.id}`} />
      <AssignGroups key={JSON.stringify([settings, assignments.groups])} community={community} userId={profile.id} settings={settings} groups={assignments.groups} />
    </div>
  )
}
