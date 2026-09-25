import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AuthShell } from '@/features/auth/components/AuthAside'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { getCommunity } from '@/features/communities/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../loading'

export default function LoginPage(props: PageProps<'/[community]/login'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <LoginContent {...props} />
    </Suspense>
  )
}

async function LoginContent({ params }: PageProps<'/[community]/login'>) {
  const { community: slug } = await params
  const community = await getCommunity(slug)
  if (!community) notFound()

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={t.login.title} backHref={`/${slug}`} />
      <AuthShell community={community} src={community.heroSrc} alt={`${community.name} riders by the water`} title={t.login.heading}>
        <LoginForm community={slug} />
      </AuthShell>
    </div>
  )
}
