import { Suspense } from 'react'
import { ComingSoon } from '@/components/ComingSoon'
import { RouteSkeleton } from '../../../loading'

export default function NewGroupPage(props: PageProps<'/[community]/groups/new'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <NewGroupContent {...props} />
    </Suspense>
  )
}

async function NewGroupContent({ params }: PageProps<'/[community]/groups/new'>) {
  const { community } = await params
  return <ComingSoon title="Create group (A9)" backHref={`/${community}/chats`} />
}
