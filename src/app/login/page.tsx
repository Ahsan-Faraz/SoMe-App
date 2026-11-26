import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { SiteShell } from '@/features/auth/components/SiteShell'
import { getUserId } from '@/lib/auth/dal'
import { t } from '@/lib/i18n'
import { requestSiteName } from '@/lib/sites'
import { RouteSkeleton } from '../[community]/loading'

// Log in on the main domain (client guide 261123), e.g. from the WordPress front page: email and
// password, then /communities. 'login' is a reserved community address (private.reserved_slug).
export default function SiteLoginPage() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <SiteLoginContent />
    </Suspense>
  )
}

async function SiteLoginContent() {
  const [userId, site] = await Promise.all([getUserId(), requestSiteName()])
  if (userId) redirect('/communities')

  return (
    <SiteShell title={t.login.title} heading={t.site.loginHeading(site)}>
      <LoginForm community="" />
      <Link href="/join" className="mt-6 block text-center text-[15px] font-semibold text-accent hover:underline">
        {t.site.noLogin}
      </Link>
    </SiteShell>
  )
}
