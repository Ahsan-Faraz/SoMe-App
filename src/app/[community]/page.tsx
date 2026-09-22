import { notFound } from 'next/navigation'
import { CommunityStart } from '@/features/communities/components/CommunityStart'
import { getCommunity } from '@/features/communities/queries'

export default async function CommunityStartPage({ params }: PageProps<'/[community]'>) {
  const { community: slug } = await params
  const community = await getCommunity(slug)
  if (!community) notFound()

  return <CommunityStart community={community} />
}
