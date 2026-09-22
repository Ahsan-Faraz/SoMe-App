import { CommunityStart } from '@/features/communities/components/CommunityStart'
import { getCommunity } from '@/features/communities/queries'

// Shown only if the `/` redirect in next.config.ts does not run.
export default async function HomePage() {
  const community = await getCommunity('biking-stockholm')
  if (!community) return null
  return <CommunityStart community={community} />
}
