import { Suspense } from 'react'
import { CommunityStart } from '@/features/communities/components/CommunityStart'
import { getCommunity } from '@/features/communities/queries'
import { RouteSkeleton } from './[community]/loading'

// Shown only if the `/` redirect in next.config.ts does not run: the default community of the site
// being served.
export default function HomePage() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <HomeContent />
    </Suspense>
  )
}

async function HomeContent() {
  const community = await getCommunity(process.env.DEFAULT_COMMUNITY ?? 'biking-stockholm')
  if (!community) return null
  return <CommunityStart community={community} />
}
