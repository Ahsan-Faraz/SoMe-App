import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { GroupForm } from '@/features/groups/components/GroupForm'
import { getGroup } from '@/features/groups/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../../loading'

export default function GroupPage(props: PageProps<'/[community]/groups/[groupId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <GroupContent {...props} />
    </Suspense>
  )
}

async function GroupContent({ params }: PageProps<'/[community]/groups/[groupId]'>) {
  const { community, groupId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'admin') redirect(`/${community}/chats`)

  const group = await getGroup(groupId)
  if (!group) notFound()

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={group.name} backHref={`/${community}/chats`} />
      <GroupForm community={community} group={group} />
    </div>
  )
}
