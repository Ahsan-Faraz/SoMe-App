import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AdFilterForm } from '@/features/ads/components/AdFilterForm'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { getChoiceLabels } from '@/features/fields/queries'
import { t } from '@/lib/i18n'

export default function AdsFilterPage(props: PageProps<'/[community]/ads/filter'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AdsFilterContent {...props} />
    </Suspense>
  )
}

async function AdsFilterContent({ params }: PageProps<'/[community]/ads/filter'>) {
  const { community } = await params
  const [viewer, info] = await Promise.all([getViewer(community), getCommunity(community)])
  if (!viewer || !info) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)
  const lists = await getChoiceLabels(info.id)

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={t.ads.filter} backHref={`/${community}/ads`} />
      <AdFilterForm community={community} statuses={lists.statuses} districts={lists.districts} />
    </div>
  )
}
