import { Suspense } from 'react'
import { BottomNav } from '@/components/BottomNav'
import { ComingSoon } from '@/components/ComingSoon'
import { RouteSkeleton } from '../../loading'

export default function ProfilesPage(props: PageProps<'/[community]/profiles'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ProfilesContent {...props} />
    </Suspense>
  )
}

async function ProfilesContent({ params }: PageProps<'/[community]/profiles'>) {
  const { community } = await params
  return (
    <>
      <ComingSoon title="Find profiles (A5)" />
      <BottomNav community={community} active="profiles" />
    </>
  )
}
