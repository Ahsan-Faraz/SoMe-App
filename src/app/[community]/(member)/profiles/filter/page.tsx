import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { ProfileFilterForm } from '@/features/profiles/components/ProfileFilter'
import { backFrom } from '@/lib/back'
import { t } from '@/lib/i18n'

export default function FilterPage(props: PageProps<'/[community]/profiles/filter'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <FilterContent {...props} />
    </Suspense>
  )
}

async function FilterContent({ params, searchParams }: PageProps<'/[community]/profiles/filter'>) {
  const { community } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  // One filter for the list and for A27 Browse profiles; Show returns to whichever opened it.
  const returnHref = backFrom((await searchParams).back, community, `/${community}/profiles`)

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={t.profiles.filter} backHref={returnHref} />
      <ProfileFilterForm community={community} returnHref={returnHref} />
    </div>
  )
}
