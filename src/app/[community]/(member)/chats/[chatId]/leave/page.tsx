import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { LeaveChat } from '@/features/chats/components/LeaveChat'
import { getChatSummary } from '@/features/chats/queries'

export default function LeavePage(props: PageProps<'/[community]/chats/[chatId]/leave'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <LeaveContent {...props} />
    </Suspense>
  )
}

async function LeaveContent({ params }: PageProps<'/[community]/chats/[chatId]/leave'>) {
  const { community, chatId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)

  const chat = await getChatSummary(chatId)
  if (!chat) notFound()

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={chat.name} backHref={`/${community}/chats/${chat.id}`} />
      <LeaveChat community={community} chatId={chat.id} listHref={`/${community}/chats`} />
    </div>
  )
}
