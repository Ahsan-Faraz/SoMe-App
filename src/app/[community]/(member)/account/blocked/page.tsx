import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { BlockedList } from '@/features/blocks/components/BlockedList'
import { getMyBlocks } from '@/features/blocks/queries'
import { t } from '@/lib/i18n'

export default function BlockedPage(props: PageProps<'/[community]/account/blocked'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <BlockedContent {...props} />
    </Suspense>
  )
}

// "Blocked people", from your own profile: members and applicants alike.
async function BlockedContent({ params }: PageProps<'/[community]/account/blocked'>) {
  const { community } = await params
  const [viewer, people] = await Promise.all([getViewer(community), getMyBlocks(community)])
  if (!viewer) redirect(`/${community}/login`)

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.blocked.title} backHref={`/${community}/profiles/${viewer.userId}`} />
      <BlockedList community={community} people={people} />
    </div>
  )
}
