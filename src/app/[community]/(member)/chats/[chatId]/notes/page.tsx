import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { getChatSummary } from '@/features/chats/queries'
import { PrivateNotes } from '@/features/notes/components/PrivateNotes'
import { t } from '@/lib/i18n'

export default function ChatNotesPage(props: PageProps<'/[community]/chats/[chatId]/notes'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ChatNotesContent {...props} />
    </Suspense>
  )
}

async function ChatNotesContent({ params }: PageProps<'/[community]/chats/[chatId]/notes'>) {
  const { community, chatId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)

  const chat = await getChatSummary(chatId)
  if (!chat) notFound()

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={t.notes.title} backHref={`/${community}/chats/${chat.id}`} />
      <PrivateNotes storageKey={`some:notes:${community}:${viewer.userId}:chat:${chat.id}`} title={chat.name} />
    </div>
  )
}
