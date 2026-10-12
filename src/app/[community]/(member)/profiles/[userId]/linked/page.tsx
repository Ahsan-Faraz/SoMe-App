import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { LinkPicker } from '@/features/profiles/components/LinkPicker'
import { getProfile, listProfileNames } from '@/features/profiles/queries'
import { t } from '@/lib/i18n'

// A32: add linked profiles to your own profile.
export default function LinkedPage(props: PageProps<'/[community]/profiles/[userId]/linked'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <LinkedContent {...props} />
    </Suspense>
  )
}

async function LinkedContent({ params }: PageProps<'/[community]/profiles/[userId]/linked'>) {
  const { community, userId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  // Only your own links can be edited.
  if (userId !== viewer.userId) redirect(`/${community}/profiles/${userId}`)

  const [profile, candidates] = await Promise.all([getProfile(userId, viewer.userId, viewer.username), listProfileNames(viewer.userId)])
  if (!profile) redirect(`/${community}/profiles`)

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.linked.title} backHref={`/${community}/profiles/${userId}`} />
      <LinkPicker community={community} userId={userId} linked={profile.linked} linkedYou={profile.linkedYou} candidates={candidates} />
    </div>
  )
}
