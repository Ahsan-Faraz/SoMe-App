import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { GroupForm } from '@/features/groups/components/GroupForm'
import { getGroupSettings } from '@/features/groups/queries'
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
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  // The group admin or the community admin; null for anyone else.
  const settings = await getGroupSettings(community, groupId)
  if (!settings) notFound()
  const { group, infos } = settings

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={group.name} backHref={`/${community}/chats/${group.id}/info`} />
      <GroupForm key={JSON.stringify(settings)} community={community} group={group} infos={infos} />
    </div>
  )
}
