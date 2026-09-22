import { ComingSoon } from '@/components/ComingSoon'

export default async function NewChatPage({ params }: PageProps<'/[community]/chats/new'>) {
  const { community } = await params
  return <ComingSoon title="Join a chat (A2)" backHref={`/${community}/chats`} />
}
