import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { PrivateNotes } from '@/features/notes/components/PrivateNotes'
import { getNote } from '@/features/notes/queries'
import { backFrom } from '@/lib/back'
import { getProfile } from '@/features/profiles/queries'

export default function ProfileNotesPage(props: PageProps<'/[community]/profiles/[userId]/notes'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ProfileNotesContent {...props} />
    </Suspense>
  )
}

// B5: my notes about this member, from their profile ⭐, a DM ⭐ or swipe: one note per person.
async function ProfileNotesContent({ params, searchParams }: PageProps<'/[community]/profiles/[userId]/notes'>) {
  const { community, userId } = await params
  const [viewer, info] = await Promise.all([getViewer(community), getCommunity(community)])
  if (!viewer || !info) redirect(`/${community}/login`)

  // Only about someone you can see, never yourself (the database refuses those too).
  const [profile, note] = await Promise.all([getProfile(community, userId), getNote(community, viewer.userId, userId)])
  if (!profile || profile.own) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={profile.username} backHref={backFrom((await searchParams).back, community, `/${community}/profiles/${profile.id}`)} />
      <PrivateNotes key={note.version} communityId={info.id} subjectId={profile.id} note={note} />
    </div>
  )
}
