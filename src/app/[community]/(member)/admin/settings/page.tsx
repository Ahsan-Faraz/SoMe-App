import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireAdmin } from '@/features/auth/queries'
import { CommunitySettingsForm } from '@/features/communities/components/CommunitySettingsForm'
import { CommunityStartForm } from '@/features/communities/components/CommunityStartForm'
import { getCommunity } from '@/features/communities/queries'
import { t } from '@/lib/i18n'

// Community settings, from the admin menu (client feedback 261102): the start page (261123), then the
// application and member settings.
export default function CommunitySettingsPage(props: PageProps<'/[community]/admin/settings'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <CommunitySettingsContent {...props} />
    </Suspense>
  )
}

async function CommunitySettingsContent({ params }: PageProps<'/[community]/admin/settings'>) {
  const { community } = await params
  const [, info] = await Promise.all([requireAdmin(community), getCommunity(community)])
  if (!info) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.settings.title} backHref={`/${community}/admin`} />
      <CommunityStartForm
        community={community}
        communityId={info.id}
        initial={{
          title: info.startTitle,
          headline: info.headline,
          about: info.about.join('\n\n'),
          listed: info.listed,
          heroSrc: info.heroSrc,
          heroUploaded: info.heroUploaded,
        }}
      />
      <h2 className="mx-auto mt-10 max-w-xl border-t border-line px-4 pt-6 text-[13px] font-bold tracking-wide text-muted uppercase sm:px-8">
        {t.settings.otherSettings}
      </h2>
      <CommunitySettingsForm
        community={community}
        initial={{
          applicationText: info.applicationText,
          image: info.requires.image,
          text: info.requires.text,
          names: info.requires.names,
          directJoin: info.directJoin,
          age18: info.requireAge18,
          keepImages: info.keepApplicationImages,
          stateLabels: info.stateLabels,
        }}
      />
    </div>
  )
}
