import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { getViewer } from '@/features/auth/queries'
import { chatIdForUser } from '@/features/chats/queries'
import { BrowseProfiles } from '@/features/profiles/components/BrowseProfiles'
import { listBrowseProfiles } from '@/features/profiles/queries'

// A27: browse profiles one at a time ("swipe interface").
export default function SwipePage(props: PageProps<'/[community]/profiles/swipe'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <SwipeContent {...props} />
    </Suspense>
  )
}

async function SwipeContent({ params }: PageProps<'/[community]/profiles/swipe'>) {
  const { community } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const profiles = await listBrowseProfiles()
  const chatIds: Record<string, string> = {}
  for (const profile of profiles) {
    const chatId = chatIdForUser(profile.id)
    if (chatId) chatIds[profile.id] = chatId
  }

  return <BrowseProfiles community={community} viewerId={viewer.userId} profiles={profiles} chatIds={chatIds} />
}
