import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { PlatformCommunities } from '@/features/platform/components/PlatformCommunities'
import { getPlatformCommunities, isPlatformAdmin } from '@/features/platform/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../[community]/loading'

// The platform admin's screen (client feedback 261102): every community, creating one, and
// appointing its admins. 'platform' is a reserved community address (private.reserved_slug).
export default function PlatformPage(props: PageProps<'/platform'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <PlatformContent {...props} />
    </Suspense>
  )
}

async function PlatformContent({ searchParams }: PageProps<'/platform'>) {
  // Anyone but the platform admin, logged out too, gets a plain "not found": the screen's existence
  // isn't advertised. The platform admin comes here from /communities (logged in on the main domain,
  // no community needed) or from a community's admin menu.
  if (!(await isPlatformAdmin())) notFound()
  const [communities, query] = await Promise.all([getPlatformCommunities(), searchParams])
  // Where it was opened from (?back=); a path on this site only, never another site. Otherwise the
  // community list: `/` is the WordPress site on the main domains.
  const back = Array.isArray(query.back) ? query.back[0] : query.back

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.platform.title} backHref={back?.startsWith('/') && !back.startsWith('//') ? back : '/communities'} />
      <PlatformCommunities communities={communities} />
    </div>
  )
}
