import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AdEditor } from '@/features/ads/components/AdEditor'
import { listAds } from '@/features/ads/queries'
import { getViewer } from '@/features/auth/queries'
import { chatIdForUser } from '@/features/chats/queries'
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
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const [ads, me] = await Promise.all([listAds(), getProfile(viewer.userId, viewer.userId, viewer.username)])
  const ad = ads.find((item) => item.id === adId)
  const own = !ad || ad.userId === viewer.userId
  const chatId = ad && !own ? chatIdForUser(ad.userId) : null
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
        chatHref={chatId ? `/${community}/chats/${chatId}` : null}
        author={{ userId: me.id, username: me.username, status: me.status, age: me.age }}
      />
    </div>
  )
}
