import { ComingSoon } from '@/components/ComingSoon'

export default async function ProfilePage({ params }: PageProps<'/[community]/profiles/[userId]'>) {
  const { community } = await params
  return <ComingSoon title="Profile (A3 / B1)" backHref={`/${community}/chats`} />
}
