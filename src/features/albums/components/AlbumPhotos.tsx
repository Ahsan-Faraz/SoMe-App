'use client'

import { useEffect, useState } from 'react'
import { readPhoto } from '@/features/profiles/photo'
import type { MainPhoto } from '@/features/profiles/types'
import { t } from '@/lib/i18n'
import { albumKey, loadAlbums } from '../storage'
import type { Album } from '../types'

export type PickedPhoto = { src: string; verified: boolean; date: string }

// "From profile/album": the viewer's profile picture first, then every album photo.
// Used by the chat picture sheet and the ad editor.
export function AlbumPhotos({
  community,
  viewerId,
  albums,
  profilePhoto = null,
  onPick,
}: {
  community: string
  viewerId: string
  albums: Album[]
  profilePhoto?: MainPhoto | null
  onPick: (photo: PickedPhoto) => void
}) {
  const [photos, setPhotos] = useState<(PickedPhoto & { id: string })[] | null>(null)

  useEffect(() => {
    const profile = readPhoto(community, viewerId) ?? profilePhoto
    const stored = loadAlbums(albumKey(community, viewerId), albums).flatMap((album) => album.images)
    setPhotos([...(profile ? [{ id: 'profile', ...profile }] : []), ...stored])
  }, [community, viewerId, albums, profilePhoto])

  if (!photos) return null
  if (photos.length === 0) return <p className="px-5 py-8 text-[16px] text-muted">{t.albums.noPhotos}</p>

  return (
    <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-2">
      {photos.map((photo) => (
        <li key={photo.id}>
          <button type="button" onClick={() => onPick({ src: photo.src, verified: photo.verified, date: photo.date })} className="block w-full rounded-xl text-left focus-visible:outline-2 focus-visible:outline-accent">
            {/* A static path or a captured data URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.src} alt="" loading="lazy" decoding="async" className="aspect-square w-full rounded-xl object-cover" />
            <span className="mt-1 block text-[13px] text-muted">{photo.verified ? `✓ ${t.chats.verified} · ${photo.date}` : photo.date}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
