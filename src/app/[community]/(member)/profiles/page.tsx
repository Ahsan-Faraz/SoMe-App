import { BottomNav } from '@/components/BottomNav'
import { ComingSoon } from '@/components/ComingSoon'

export default async function ProfilesPage({ params }: PageProps<'/[community]/profiles'>) {
  const { community } = await params
  return (
    <>
      <ComingSoon title="Find profiles (A5)" />
      <BottomNav community={community} active="profiles" />
    </>
  )
}
