import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { Directory } from '@/features/chats/components/Directory'
import { listDirectory } from '@/features/chats/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../../loading'

export default function NewChatPage(props: PageProps<'/[community]/chats/new'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <NewChatContent {...props} />
    </Suspense>
  )
}

async function NewChatContent({ params }: PageProps<'/[community]/chats/new'>) {
  const { community } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const entries = await listDirectory(community)

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={t.chats.joinTitle} backHref={`/${community}/chats`} />
      <Directory entries={entries} />
    </div>
  )
}
