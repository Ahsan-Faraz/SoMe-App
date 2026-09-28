import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { ProfileFilterForm } from '@/features/profiles/components/ProfileFilter'
import { t } from '@/lib/i18n'

export default function FilterPage(props: PageProps<'/[community]/profiles/filter'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <FilterContent {...props} />
    </Suspense>
  )
}

async function FilterContent({ params }: PageProps<'/[community]/profiles/filter'>) {
  const { community } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={t.profiles.filter} backHref={`/${community}/profiles`} />
      <ProfileFilterForm community={community} />
    </div>
  )
}
