import { Suspense } from 'react'
import { ComingSoon } from '@/components/ComingSoon'
import { RouteSkeleton } from '../../../loading'

export default function ChatPage(props: PageProps<'/[community]/chats/[chatId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ChatContent {...props} />
    </Suspense>
  )
}

async function ChatContent({ params }: PageProps<'/[community]/chats/[chatId]'>) {
  const { community } = await params
  return <ComingSoon title="Chat (A4)" backHref={`/${community}/chats`} />
}
