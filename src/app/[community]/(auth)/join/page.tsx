import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AuthShell } from '@/features/auth/components/AuthAside'
import { JoinForm } from '@/features/auth/components/JoinForm'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { getUserId } from '@/lib/auth/dal'
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
  const [community, viewer, userId] = await Promise.all([getCommunity(slug), getViewer(slug), getUserId()])
  if (!community) notFound()
  // Logged in on this domain (from /communities, or another community here): an account here
  // already opens it; otherwise only a username for this community and the consents.
  if (viewer) redirect(viewer.role === 'pending' ? `/${slug}/pending` : `/${slug}/chats`)

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.join.title} backHref={`/${slug}`} right={<ThemeToggle className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover" />} />
      <AuthShell community={community} src={community.aboutSrc} alt={t.start.aboutAlt} title={t.join.heading}>
        <JoinForm
          community={slug}
          communityName={community.name}
          privacyVersion={community.privacyVersion}
          requireAge18={community.requireAge18}
          signedIn={!!userId}
        />
      </AuthShell>
    </div>
  )
}
