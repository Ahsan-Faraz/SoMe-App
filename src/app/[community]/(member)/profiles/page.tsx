import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/BottomNav'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { ProfileList } from '@/features/profiles/components/ProfileList'
import { listProfiles } from '@/features/profiles/queries'
import { RouteSkeleton } from '../../loading'

export default function ProfilesPage(props: PageProps<'/[community]/profiles'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ProfilesContent {...props} />
    </Suspense>
  )
}

async function ProfilesContent({ params }: PageProps<'/[community]/profiles'>) {
  const { community } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const info = await getCommunity(community)
  if (!info) redirect(`/${community}/login`)
  const [profiles, schema] = await Promise.all([listProfiles(community), getProfileSchema(info.id)])

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ProfileList community={community} viewerId={viewer.userId} profiles={profiles} builtins={schema.builtins} />
      </main>
      <BottomNav community={community} active="profiles" />
    </div>
  )
}
