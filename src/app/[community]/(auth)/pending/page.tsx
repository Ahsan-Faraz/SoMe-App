import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { PendingSteps } from '@/features/auth/components/PendingSteps'
import { getViewer } from '@/features/auth/queries'
import { getAdminChatId } from '@/features/chats/queries'
import { getCommunity } from '@/features/communities/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../loading'

export default function PendingPage(props: PageProps<'/[community]/pending'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <PendingContent {...props} />
    </Suspense>
  )
}

async function PendingContent({ params }: PageProps<'/[community]/pending'>) {
  const { community: slug } = await params
  const [community, viewer] = await Promise.all([getCommunity(slug), getViewer()])
  if (!community) notFound()
  if (!viewer) redirect(`/${slug}/login`)
  if (viewer.role !== 'pending') redirect(`/${slug}/chats`)

  const adminChatId = await getAdminChatId(slug)

  return (
    <>
      <ScreenHeader title={t.pending.title} />
      <main className="mx-auto max-w-md px-6 pt-6 pb-12">
        <PendingSteps
          profileHref={`/${slug}/profiles/${viewer.userId}`}
          adminChatHref={`/${slug}/chats/${adminChatId}`}
        />
      </main>
    </>
  )
}
