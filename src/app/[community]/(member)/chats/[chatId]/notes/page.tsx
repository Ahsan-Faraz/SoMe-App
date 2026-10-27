import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { getViewer } from '@/features/auth/queries'
import { getChatHeader } from '@/features/chats/queries'

export default function ChatNotesPage(props: PageProps<'/[community]/chats/[chatId]/notes'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ChatNotesContent {...props} />
    </Suspense>
  )
}

// A DM's notes are the notes about that person, the same note as from their profile (B5); the DM ⭐
// links there directly. This older address forwards there too. Groups have no notes.
async function ChatNotesContent({ params }: PageProps<'/[community]/chats/[chatId]/notes'>) {
  const { community, chatId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const chat = await getChatHeader(community, chatId)
  if (!chat || chat.kind !== 'dm' || !chat.otherUserId) notFound()
  return redirect(`/${community}/profiles/${chat.otherUserId}/notes?back=${encodeURIComponent(`/${community}/chats/${chat.id}`)}`)
}
