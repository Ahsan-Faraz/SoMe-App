import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/BottomNav'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { PublishAdLink } from '@/features/ads/components/PublishAdLink'
import { AdsFilterButton } from '@/features/ads/components/AdFilterForm'
import { AdList } from '@/features/ads/components/AdList'
import { listAds } from '@/features/ads/queries'
import { getViewer } from '@/features/auth/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../loading'

export default function AdsPage(props: PageProps<'/[community]/ads'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AdsContent {...props} />
    </Suspense>
  )
}

async function AdsContent({ params }: PageProps<'/[community]/ads'>) {
  const { community } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)
  const ads = await listAds()

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ScreenHeader
          title={t.ads.title}
          right={
            <span className="flex">
              <ThemeToggle className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover rail:hidden" />
              <AdsFilterButton community={community} />
              <PublishAdLink community={community} />
            </span>
          }
        />
        <AdList community={community} seed={ads} onlyUserId={null} />
      </main>
      <BottomNav community={community} active="ads" />
    </div>
  )
}
