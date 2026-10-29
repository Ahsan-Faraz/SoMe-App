import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AdEditor } from '@/features/ads/components/AdEditor'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { activeChoices } from '@/features/fields/schema'
import { getProfile } from '@/features/profiles/queries'
import { t } from '@/lib/i18n'

export default function NewAdPage(props: PageProps<'/[community]/ads/new'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <NewAdContent {...props} />
    </Suspense>
  )
}

async function NewAdContent({ params }: PageProps<'/[community]/ads/new'>) {
  const { community } = await params
  const [viewer, info] = await Promise.all([getViewer(community), getCommunity(community)])
  if (!viewer || !info) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)
  const [profile, schema] = await Promise.all([getProfile(community, viewer.userId), getProfileSchema(info.id)])
  if (!profile) redirect(`/${community}/ads`)

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={t.ads.publish} backHref={`/${community}/ads`} />
      <AdEditor
        community={community}
        communityId={info.id}
        viewerId={viewer.userId}
        ad={null}
        author={{ status: profile.status, ages: profile.ages }}
        profilePhoto={profile.photo}
        statuses={activeChoices(schema.statuses)}
        districts={activeChoices(schema.districts)}
      />
    </div>
  )
}
