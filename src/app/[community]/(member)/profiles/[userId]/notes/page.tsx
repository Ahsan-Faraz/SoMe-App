import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { PrivateNotes } from '@/features/notes/components/PrivateNotes'
import { backFrom } from '@/lib/back'
import { getProfile } from '@/features/profiles/queries'

export default function ProfileNotesPage(props: PageProps<'/[community]/profiles/[userId]/notes'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ProfileNotesContent {...props} />
    </Suspense>
  )
}

async function ProfileNotesContent({ params, searchParams }: PageProps<'/[community]/profiles/[userId]/notes'>) {
  const { community, userId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)

  const profile = await getProfile(userId, viewer.userId, viewer.username)
  if (!profile) notFound()

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={profile.username} backHref={backFrom((await searchParams).back, community, `/${community}/profiles/${profile.id}`)} />
      <PrivateNotes storageKey={`some:notes:${community}:${viewer.userId}:profile:${profile.id}`} />
    </div>
  )
}
