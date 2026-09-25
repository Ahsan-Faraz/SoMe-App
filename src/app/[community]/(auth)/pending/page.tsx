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
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={t.pending.title} />
      <main className="grid w-full gap-8 px-5 pt-6 pb-12 sm:px-8 min-[52rem]:grid-cols-2 min-[52rem]:items-start min-[52rem]:gap-16 min-[52rem]:px-12 min-[52rem]:pt-14">
        <div className="hidden min-[52rem]:block">
          <h2 className="text-4xl font-medium tracking-tight">{community.name}</h2>
          <p className="mt-3 max-w-md text-[15px] text-ink">{community.headline}</p>
        </div>
        <PendingSteps
          profileHref={`/${slug}/profiles/${viewer.userId}`}
          adminChatHref={`/${slug}/chats/${adminChatId}`}
        />
      </main>
    </div>
  )
}
