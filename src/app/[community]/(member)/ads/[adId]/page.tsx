import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AdEditor } from '@/features/ads/components/AdEditor'
import { getAd } from '@/features/ads/queries'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { activeChoices } from '@/features/fields/schema'
import { getProfile } from '@/features/profiles/queries'
import { t } from '@/lib/i18n'

export default function AdPage(props: PageProps<'/[community]/ads/[adId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AdContent {...props} />
    </Suspense>
  )
}

async function AdContent({ params }: PageProps<'/[community]/ads/[adId]'>) {
  const { community, adId } = await params
  const [viewer, info] = await Promise.all([getViewer(community), getCommunity(community)])
  if (!viewer || !info) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  // ad_view decides: null when there is no such ad or the viewer may not see it (a block, a removed author).
  const [ad, me, schema] = await Promise.all([getAd(community, adId), getProfile(community, viewer.userId), getProfileSchema(info.id)])
  if (!ad) notFound()
  if (!me) redirect(`/${community}/ads`)

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={ad.own ? t.ads.publish : t.ads.title} backHref={ad.own ? `/${community}/profiles/${viewer.userId}/ads` : `/${community}/ads`} />
      {/* Keyed by the saved ad: an edit saved elsewhere seeds the form again. */}
      <AdEditor
        key={`${ad.id}:${ad.headline}:${ad.body}:${ad.place}:${ad.districtId}:${ad.lookingForIds.join()}`}
        community={community}
        communityId={info.id}
        viewerId={viewer.userId}
        ad={ad}
        author={{ status: me.status, ages: me.ages }}
        profilePhoto={me.photo}
        statuses={activeChoices(schema.statuses)}
        districts={activeChoices(schema.districts)}
      />
    </div>
  )
}
