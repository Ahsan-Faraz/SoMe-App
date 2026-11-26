import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { SiteShell } from '@/features/auth/components/SiteShell'
import { CommunityChooser } from '@/features/communities/components/CommunityChooser'
import { getSiteCommunities } from '@/features/communities/queries'
import { getUserId } from '@/lib/auth/dal'
import { t } from '@/lib/i18n'
import { requestSite, requestSiteName } from '@/lib/sites'
import { RouteSkeleton } from '../[community]/loading'

// After logging in or joining on the main domain (client guide 261123): pick a community, or join a
// visible one. 'communities' is a reserved community address (private.reserved_slug).
export default function CommunitiesPage() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <CommunitiesContent />
    </Suspense>
  )
}

async function CommunitiesContent() {
  // The session check reads the cookie (no database); logged out, there is nothing to list.
  if (!(await getUserId())) redirect('/login')
  const site = await requestSite()
  const [siteName, communities] = await Promise.all([requestSiteName(), getSiteCommunities(site)])

  return (
    <SiteShell
      title={t.site.communitiesTitle}
      heading={siteName}
      right={
        <LogoutButton
          community=""
          to="/login"
          className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover disabled:opacity-50"
        />
      }
    >
      <CommunityChooser communities={communities} />
    </SiteShell>
  )
}
