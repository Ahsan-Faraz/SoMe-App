import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AdFilterForm } from '@/features/ads/components/AdFilterForm'
import { getAdFilter } from '@/features/ads/queries'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { activeChoices } from '@/features/fields/schema'
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
  const [saved, schema] = await Promise.all([getAdFilter(community), getProfileSchema(info.id)])

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={t.ads.filter} backHref={`/${community}/ads`} />
      {/* Keyed by the saved filter: one saved on another device seeds the form again. */}
      <AdFilterForm
        key={JSON.stringify(saved)}
        community={community}
        communityId={info.id}
        saved={saved}
        statuses={activeChoices(schema.statuses)}
        districts={activeChoices(schema.districts)}
        builtins={schema.builtins}
      />
    </div>
  )
}
