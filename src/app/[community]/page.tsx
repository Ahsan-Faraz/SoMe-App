import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { CommunityStart } from '@/features/communities/components/CommunityStart'
import { getCommunity } from '@/features/communities/queries'
import { RouteSkeleton } from './loading'

export default function CommunityStartPage(props: PageProps<'/[community]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <CommunityStartContent {...props} />
    </Suspense>
  )
}

async function CommunityStartContent({ params }: PageProps<'/[community]'>) {
  const { community: slug } = await params
  const community = await getCommunity(slug)
  if (!community) notFound()

  return <CommunityStart community={community} />
}
