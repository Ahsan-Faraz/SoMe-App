import { ComingSoon } from '@/components/ComingSoon'

export default async function ChatPage({ params }: PageProps<'/[community]/chats/[chatId]'>) {
  const { community } = await params
  return <ComingSoon title="Chat (A4)" backHref={`/${community}/chats`} />
}
