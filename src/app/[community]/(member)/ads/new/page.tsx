import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AdEditor } from '@/features/ads/components/AdEditor'
import { listAds } from '@/features/ads/queries'
import { getViewer } from '@/features/auth/queries'
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
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)
  const [ads, profile] = await Promise.all([listAds(), getProfile(viewer.userId, viewer.userId, viewer.username)])
  if (!profile) redirect(`/${community}/ads`)

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={t.ads.publish} backHref={`/${community}/ads`} />
      <AdEditor
        community={community}
        seed={ads}
        adId={null}
        own
        profileHref={null}
        chatHref={null}
        author={{ userId: profile.id, username: profile.username, status: profile.status, age: profile.age }}
      />
    </div>
  )
}
