import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { AddList } from '@/features/groups/components/AddList'
import { getGroup, listPeopleToAdd } from '@/features/groups/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../../../loading'

export default function AddMembersPage(props: PageProps<'/[community]/groups/[groupId]/add'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AddMembersContent {...props} />
    </Suspense>
  )
}

async function AddMembersContent({ params }: PageProps<'/[community]/groups/[groupId]/add'>) {
  const { community, groupId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'admin') redirect(`/${community}/chats`)

  const [group, people] = await Promise.all([getGroup(groupId), listPeopleToAdd(groupId)])
  if (!group) notFound()

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={`${group.name} – ${t.groups.add}`} backHref={`/${community}/groups/${group.id}/members`} />
      <AddList community={community} people={people} />
    </div>
  )
}
