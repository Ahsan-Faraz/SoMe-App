import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { PlatformCommunities } from '@/features/platform/components/PlatformCommunities'
import { getPlatformCommunities, isPlatformAdmin } from '@/features/platform/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../[community]/loading'

// The platform admin's screen (client feedback 261102): every community, creating one, and
// appointing its admins. 'platform' is a reserved community address (private.reserved_slug).
export default function PlatformPage() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <PlatformContent />
    </Suspense>
  )
}

async function PlatformContent() {
  // Anyone but the platform admin, logged out too, gets a plain "not found": the screen's existence
  // isn't advertised. The platform admin logs in to a community and comes here from its admin menu.
  if (!(await isPlatformAdmin())) notFound()
  const communities = await getPlatformCommunities()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.platform.title} />
      <PlatformCommunities communities={communities} />
    </div>
  )
}
