import { BottomNav } from '@/components/BottomNav'
import { ComingSoon } from '@/components/ComingSoon'

export default async function AdsPage({ params }: PageProps<'/[community]/ads'>) {
  const { community } = await params
  return (
    <>
      <ComingSoon title="Ads (A6)" />
      <BottomNav community={community} active="ads" />
    </>
  )
}
