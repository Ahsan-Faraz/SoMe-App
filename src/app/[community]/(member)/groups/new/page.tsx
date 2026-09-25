import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { GroupForm } from '@/features/groups/components/GroupForm'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../../loading'

export default function NewGroupPage(props: PageProps<'/[community]/groups/new'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <NewGroupContent {...props} />
    </Suspense>
  )
}

async function NewGroupContent({ params }: PageProps<'/[community]/groups/new'>) {
  const { community } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'admin') redirect(`/${community}/chats`)

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={t.groups.create} backHref={`/${community}/chats`} />
      <GroupForm community={community} group={null} />
    </div>
  )
}
