import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { PublishAdLink } from '@/features/ads/components/PublishAdLink'
import { AdList } from '@/features/ads/components/AdList'
import { memberAds } from '@/features/ads/queries'
import { getViewer } from '@/features/auth/queries'
import { getProfile } from '@/features/profiles/queries'
import { t } from '@/lib/i18n'

export default function ProfileAdsPage(props: PageProps<'/[community]/profiles/[userId]/ads'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ProfileAdsContent {...props} />
    </Suspense>
  )
}

// My ads (C9) and someone's Ads: member_ads, unfiltered (at most 20 exist).
async function ProfileAdsContent({ params }: PageProps<'/[community]/profiles/[userId]/ads'>) {
  const { community, userId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)
  const [profile, ads] = await Promise.all([getProfile(community, userId), memberAds(community, userId)])
  if (!profile) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={profile.own ? t.ads.mine : profile.username} backHref={`/${community}/profiles/${profile.id}`} right={profile.own ? <PublishAdLink community={community} /> : undefined} />
      <AdList community={community} cards={ads} paged={false} />
    </div>
  )
}
