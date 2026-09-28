import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { chatIdForUser } from '@/features/chats/queries'
import { ReplacePhoto } from '@/features/profiles/components/ReplacePhoto'
import { ProfileView } from '@/features/profiles/components/ProfileView'
import { getProfile } from '@/features/profiles/queries'
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

  const profile = await getProfile(userId, viewer.userId, viewer.username)
  if (!profile) notFound()

  const query = await searchParams
  const section = first(query.section)
  // Came from a chat or group info: go back there, but only to a path inside this community.
  const from = first(query.back)
  const backHref = from?.startsWith(`/${community}/`) && !from.startsWith('//') ? from : viewer.role === 'pending' ? `/${community}/pending` : `/${community}/profiles`

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={profile.username} backHref={backHref} right={profile.own ? <ReplacePhoto community={community} userId={profile.id} /> : undefined} />
      <ProfileView
        community={community}
        profile={profile}
        chatId={profile.own ? null : chatIdForUser(profile.id)}
        isAdmin={viewer.role === 'admin'}
        section={section}
      />
    </div>
  )
}

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}
