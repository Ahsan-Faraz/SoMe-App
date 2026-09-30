import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AuthShell } from '@/features/auth/components/AuthAside'
import { JoinForm } from '@/features/auth/components/JoinForm'
import { getCommunity } from '@/features/communities/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../loading'

export default function JoinPage(props: PageProps<'/[community]/join'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <JoinContent {...props} />
    </Suspense>
  )
}

async function JoinContent({ params }: PageProps<'/[community]/join'>) {
  const { community: slug } = await params
  const community = await getCommunity(slug)
  if (!community) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.join.title} backHref={`/${slug}`} right={<ThemeToggle className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover" />} />
      <AuthShell community={community} src={community.aboutSrc} alt="Two riders on a gravel path outside Stockholm" title={t.join.heading}>
        <JoinForm community={slug} communityName={community.name} />
      </AuthShell>
    </div>
  )
}
