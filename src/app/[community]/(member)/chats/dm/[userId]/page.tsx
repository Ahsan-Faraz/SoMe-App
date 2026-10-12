import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { listAlbums } from '@/features/albums/queries'
import { getViewer } from '@/features/auth/queries'
import { ChatThread } from '@/features/chats/components/ChatThread'
import { chatIdForUser } from '@/features/chats/queries'
import { getProfile } from '@/features/profiles/queries'

// A DM button for someone you have no chat with yet (e.g. an admin writing to an applicant).
// The chat itself is made when the first message is sent (backend step 6: find or create a DM).
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

  const existing = chatIdForUser(userId)
  if (existing) redirect(`/${community}/chats/${existing}`)

  const [profile, albums] = await Promise.all([getProfile(userId, viewer.userId, viewer.username), listAlbums(viewer.userId)])
  if (!profile) notFound()

  const base = `/${community}/chats/dm/${userId}`
  const rules = { post: true, comment: true, react: true, edit: true }

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={profile.username} backHref={`/${community}/chats`} />
      <ChatThread community={community} chatId={`dm-${userId}`} backHref={base} messages={[]} isAdmin={viewer.role === 'admin'} rules={rules} viewerId={viewer.userId} albums={albums} />
    </div>
  )
}
