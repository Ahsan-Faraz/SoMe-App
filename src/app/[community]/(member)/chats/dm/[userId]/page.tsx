import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { ChatThread } from '@/features/chats/components/ChatThread'
import { findDm } from '@/features/chats/queries'
import type { ChatRules } from '@/features/chats/types'
import { listAlbums } from '@/features/albums/queries'
import { getCommunity } from '@/features/communities/queries'
import { getProfile } from '@/features/profiles/queries'

// Every "DM" button lands here: the existing DM with that person, or an empty one that is made
// when the first message is sent (open_dm). E.g. the community admin writing to an applicant.
export default function NewDmPage(props: PageProps<'/[community]/chats/dm/[userId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <NewDmContent {...props} />
    </Suspense>
  )
}

async function NewDmContent({ params }: PageProps<'/[community]/chats/dm/[userId]'>) {
  const { community, userId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending' || userId === viewer.userId) redirect(`/${community}/chats`)

  const [existing, profile, info, albums] = await Promise.all([findDm(community, userId), getProfile(community, userId), getCommunity(community), listAlbums(viewer.userId)])
  if (existing) redirect(`/${community}/chats/${existing}`)
  if (!profile || !info) notFound()

  // A new DM: the first post (text or a picture) makes it; nothing to react to or comment on yet.
  const rules: ChatRules = { post: true, comment: false, react: false, edit: false, remove: false, images: true }

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={profile.username} backHref={`/${community}/chats`} />
      <ChatThread
        key={userId}
        community={community}
        communityId={info.id}
        chatId={null}
        dmUserId={userId}
        group={false}
        initial={[]}
        hasOlder={false}
        statuses={{}}
        viewerId={viewer.userId}
        isAdmin={false}
        rules={rules}
        albums={albums}
        backHref={`/${community}/chats/dm/${userId}`}
      />
    </div>
  )
}
