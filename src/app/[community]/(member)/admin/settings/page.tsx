import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireAdmin } from '@/features/auth/queries'
import { CommunitySettingsForm } from '@/features/communities/components/CommunitySettingsForm'
import { getCommunity } from '@/features/communities/queries'
import { t } from '@/lib/i18n'

// Community settings, from the admin menu (client feedback 261102).
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
      <CommunitySettingsForm
        community={community}
        initial={{
          applicationText: info.applicationText,
          image: info.requires.image,
          text: info.requires.text,
          names: info.requires.names,
          directJoin: info.directJoin,
        }}
      />
    </div>
  )
}
