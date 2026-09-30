import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AlbumView } from '@/features/albums/components/AlbumView'
import { listAlbums } from '@/features/albums/queries'
import { getViewer } from '@/features/auth/queries'
import { getProfile } from '@/features/profiles/queries'
import { t } from '@/lib/i18n'

export default function AlbumPage(props: PageProps<'/[community]/profiles/[userId]/albums/[albumId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AlbumContent {...props} />
    </Suspense>
  )
}

async function AlbumContent({ params }: PageProps<'/[community]/profiles/[userId]/albums/[albumId]'>) {
  const { community, userId, albumId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)

  const [profile, albums] = await Promise.all([getProfile(userId, viewer.userId, viewer.username), listAlbums(userId)])
  if (!profile) notFound()
  const album = albums.find((item) => item.id === albumId)

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={album?.name ?? t.profiles.albums} backHref={`/${community}/profiles/${profile.id}/albums`} />
      <AlbumView community={community} userId={profile.id} albumId={albumId} own={profile.own} seed={albums} />
    </div>
  )
}
