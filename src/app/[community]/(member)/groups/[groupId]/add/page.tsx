import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { AddList } from '@/features/groups/components/AddList'
import { getScope, listRoster } from '@/features/membership/queries'
import { listProfiles } from '@/features/profiles/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../../../loading'

// A30 "+": add members to a group. Its admins only (the group admin or the community admin).
export default function AddMembersPage(props: PageProps<'/[community]/groups/[groupId]/add'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AddMembersContent {...props} />
    </Suspense>
  )
}

async function AddMembersContent({ params }: PageProps<'/[community]/groups/[groupId]/add'>) {
  const { community, groupId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const [scope, info, roster, cards] = await Promise.all([
    getScope('group', community, groupId),
    getCommunity(community),
    listRoster(community, 'group', groupId),
    listProfiles(community),
  ])
  if (!scope || !info) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={`${scope.name} – ${t.groups.add}`} backHref={`/${community}/groups/${groupId}/members`} />
      <AddList
        community={community}
        communityId={info.id}
        groupId={scope.id}
        people={cards.map((card) => ({ id: card.id, username: card.username, icon: card.photo?.src ?? null }))}
        memberIds={roster.members.map((member) => member.userId)}
      />
    </div>
  )
}
