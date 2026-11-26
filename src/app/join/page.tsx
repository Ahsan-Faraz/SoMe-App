import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteJoinForm } from '@/features/auth/components/SiteJoinForm'
import { SiteShell } from '@/features/auth/components/SiteShell'
import { getUserId } from '@/lib/auth/dal'
import { t } from '@/lib/i18n'
import { requestSiteName } from '@/lib/sites'
import { RouteSkeleton } from '../[community]/loading'

// Join on the main domain (client guide 261123): a login for this domain, then /communities to pick
// a community. 'join' is a reserved community address (private.reserved_slug).
export default function SiteJoinPage() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <SiteJoinContent />
    </Suspense>
  )
}

async function SiteJoinContent() {
  const [userId, site] = await Promise.all([getUserId(), requestSiteName()])
  if (userId) redirect('/communities')

  return (
    <SiteShell title={t.site.joinTitle} heading={t.site.joinHeading(site)}>
      <SiteJoinForm />
      <Link href="/login" className="mt-6 block text-center text-[15px] font-semibold text-accent hover:underline">
        {t.site.haveLogin}
      </Link>
    </SiteShell>
  )
}
