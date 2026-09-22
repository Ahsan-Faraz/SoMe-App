import { Suspense } from 'react'
import { ComingSoon } from '@/components/ComingSoon'
import { RouteSkeleton } from '../../../loading'

export default function ProfilePage(props: PageProps<'/[community]/profiles/[userId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ProfileContent {...props} />
    </Suspense>
  )
}

async function ProfileContent({ params }: PageProps<'/[community]/profiles/[userId]'>) {
  const { community } = await params
  return <ComingSoon title="Profile (A3 / B1)" backHref={`/${community}/chats`} />
}
