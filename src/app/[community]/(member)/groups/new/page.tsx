import { ComingSoon } from '@/components/ComingSoon'

export default async function NewGroupPage({ params }: PageProps<'/[community]/groups/new'>) {
  const { community } = await params
  return <ComingSoon title="Create group (A9)" backHref={`/${community}/chats`} />
}
