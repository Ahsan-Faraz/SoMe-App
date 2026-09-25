import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { chatIdForUser } from '@/features/chats/queries'
import { ReplacePhoto } from '@/features/profiles/components/ReplacePhoto'
import { ProfileView } from '@/features/profiles/components/ProfileView'
import { getProfile } from '@/features/profiles/queries'
import { listGroupNames } from '@/features/groups/queries'
import { RouteSkeleton } from '../../../loading'

export default function ProfilePage(props: PageProps<'/[community]/profiles/[userId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ProfileContent {...props} />
    </Suspense>
  )
}

async function ProfileContent({ params, searchParams }: PageProps<'/[community]/profiles/[userId]'>) {
  const { community, userId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)

  const [profile, groups] = await Promise.all([
    getProfile(userId, viewer.userId, viewer.username),
    listGroupNames(),
  ])
  if (!profile) notFound()

  const requested = (await searchParams).section
  const section = Array.isArray(requested) ? requested[0] ?? null : requested ?? null
  const backHref = viewer.role === 'pending' ? `/${community}/pending` : `/${community}/profiles`

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={profile.username} backHref={backHref} right={profile.own ? <ReplacePhoto /> : undefined} />
      <ProfileView
        community={community}
        profile={profile}
        chatId={profile.own ? null : chatIdForUser(profile.id)}
        isAdmin={viewer.role === 'admin'}
        section={section}
        groups={groups}
      />
    </div>
  )
}
