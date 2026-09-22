import { Suspense } from 'react'
import { ComingSoon } from '@/components/ComingSoon'
import { RouteSkeleton } from '../../../loading'

export default function NewChatPage(props: PageProps<'/[community]/chats/new'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <NewChatContent {...props} />
    </Suspense>
  )
}

async function NewChatContent({ params }: PageProps<'/[community]/chats/new'>) {
  const { community } = await params
  return <ComingSoon title="Join a chat (A2)" backHref={`/${community}/chats`} />
}
