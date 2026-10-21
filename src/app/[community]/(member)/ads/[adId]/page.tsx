import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AdEditor } from '@/features/ads/components/AdEditor'
import { listAds } from '@/features/ads/queries'
import { listAlbums } from '@/features/albums/queries'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { getChoiceLabels } from '@/features/fields/queries'
import { dmHref } from '@/features/chats/links'
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

  const [ads, me, albums, lists] = await Promise.all([
    listAds(),
    getProfile(community, viewer.userId),
    listAlbums(viewer.userId),
    getChoiceLabels(info.id),
  ])
  const ad = ads.find((item) => item.id === adId)
  const own = !ad || ad.userId === viewer.userId
  if (!me) redirect(`/${community}/ads`)

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={own ? t.ads.publish : t.ads.title} backHref={`/${community}/ads`} />
      <AdEditor
        community={community}
        seed={ads}
        adId={adId}
        own={own}
        profileHref={ad && !own ? `/${community}/profiles/${ad.userId}` : null}
        chatHref={ad && !own ? dmHref(community, ad.userId) : null}
        author={{ userId: me.id, username: me.username, status: me.status, age: me.ages[0] ?? 0 }}
        albums={own ? albums : []}
        profilePhoto={me.photo}
        statuses={lists.statuses}
        districts={lists.districts}
      />
    </div>
  )
}
