import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { AlbumList } from '@/features/albums/components/AlbumList'
import { listAlbums } from '@/features/albums/queries'
import { getViewer } from '@/features/auth/queries'
import { getProfile } from '@/features/profiles/queries'
import { t } from '@/lib/i18n'

export default function AlbumsPage(props: PageProps<'/[community]/profiles/[userId]/albums'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <AlbumsContent {...props} />
    </Suspense>
  )
}

// B3: the profile and its albums in one round trip (covers signed on the server).
async function AlbumsContent({ params, searchParams }: PageProps<'/[community]/profiles/[userId]/albums'>) {
  const { community, userId } = await params
  const requested = (await searchParams).add
  const adding = requested === '1' || (Array.isArray(requested) && requested[0] === '1')
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const [profile, albums] = await Promise.all([getProfile(community, userId), listAlbums(community, userId)])
  if (!profile) notFound()

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader
        title={profile.username}
        backHref={`/${community}/profiles/${profile.id}`}
        right={
          profile.own ? (
            <Link href={`/${community}/profiles/${profile.id}/albums?add=1`} aria-label={t.albums.add} className="inline-flex size-11 items-center justify-center">
              <Icon name="plus" />
            </Link>
          ) : undefined
        }
      />
      <AlbumList community={community} userId={profile.id} own={profile.own} albums={albums} startAdding={adding && profile.own} />
    </div>
  )
}
