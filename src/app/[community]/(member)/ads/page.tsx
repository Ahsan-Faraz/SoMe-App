import { Suspense } from 'react'
import { BottomNav } from '@/components/BottomNav'
import { ComingSoon } from '@/components/ComingSoon'
import { RouteSkeleton } from '../../loading'

export default function AdsPage(props: PageProps<'/[community]/ads'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AdsContent {...props} />
    </Suspense>
  )
}

async function AdsContent({ params }: PageProps<'/[community]/ads'>) {
  const { community } = await params
  return (
    <>
      <ComingSoon title="Ads (A6)" />
      <BottomNav community={community} active="ads" />
    </>
  )
}
