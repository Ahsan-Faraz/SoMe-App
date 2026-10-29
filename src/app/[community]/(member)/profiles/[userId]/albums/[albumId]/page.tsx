import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AlbumView } from '@/features/albums/components/AlbumView'
import { getAlbum } from '@/features/albums/queries'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'

export default function AlbumPage(props: PageProps<'/[community]/profiles/[userId]/albums/[albumId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AlbumContent {...props} />
    </Suspense>
  )
}

// B4: one album (album_view checks who may see it; its photos are signed only when it is open).
async function AlbumContent({ params }: PageProps<'/[community]/profiles/[userId]/albums/[albumId]'>) {
  const { community, userId, albumId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const [album, info] = await Promise.all([getAlbum(community, albumId), getCommunity(community)])
  if (!album || !info || album.ownerId !== userId) notFound()
  const listHref = `/${community}/profiles/${userId}/albums`

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={album.name} backHref={listHref} />
      <AlbumView key={album.id} community={community} communityId={info.id} viewerId={viewer.userId} album={album} listHref={listHref} />
    </div>
  )
}
