'use client'

import { useEffect, useState } from 'react'
import type { MainPhoto } from '@/features/profiles/types'
import { formatDay } from '@/lib/format'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/browser'
import type { PickedPhoto } from '../types'

export type { PickedPhoto }

const SIGNED_URL_SECONDS = 60 * 60

// "From profile/album": the viewer's profile picture first, then their album photos, newest first.
// Read when the picker opens (my_album_photos, then one signing call for the thumbnails and the full
// images: your own folder). The picked photo is copied into the chat or ad, never shared.
// Used by the chat picture sheet and the ad editor.
export function AlbumPhotos({ communityId, profilePhoto = null, onPick }: { communityId: string; profilePhoto?: MainPhoto | null; onPick: (photo: PickedPhoto) => void }) {
  const [photos, setPhotos] = useState<(PickedPhoto & { id: string; thumb: string })[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('my_album_photos', { p_community: communityId })
      if (error) return live && setFailed(true)
      const paths = data.flatMap((row) => [row.path, row.thumb_path])
      const signed = paths.length ? await supabase.storage.from('private').createSignedUrls(paths, SIGNED_URL_SECONDS) : { data: [], error: null }
      if (signed.error) return live && setFailed(true)
      const urls = new Map((signed.data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])))
      const album = data.flatMap((row) => {
        const src = urls.get(row.path)
        const thumb = urls.get(row.thumb_path)
        return src && thumb ? [{ id: row.id, src, thumb, verified: row.taken_in_app, date: row.taken_at ? formatDay(new Date(row.taken_at)) : '' }] : []
      })
      const profile = profilePhoto ? [{ id: 'profile', src: profilePhoto.src, thumb: profilePhoto.src, verified: profilePhoto.verified, date: profilePhoto.date }] : []
      if (live) setPhotos([...profile, ...album])
    })()
    return () => {
      live = false
    }
  }, [communityId, profilePhoto])

  if (failed) return <p className="px-5 py-8 text-[16px] text-danger">{t.common.error}</p>
  if (!photos) return null
  if (photos.length === 0) return <p className="px-5 py-8 text-[16px] text-muted">{t.albums.noPhotos}</p>

  return (
    <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-2">
      {photos.map((photo) => (
        <li key={photo.id}>
          <button type="button" onClick={() => onPick({ src: photo.src, verified: photo.verified, date: photo.date })} className="block w-full rounded-xl text-left focus-visible:outline-2 focus-visible:outline-accent">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.thumb} alt="" loading="lazy" decoding="async" className="aspect-square w-full rounded-xl object-cover" />
            <span className="mt-1 block text-[13px] text-muted">{photo.verified ? `✓ ${t.chats.takenInApp} · ${photo.date}` : photo.date}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
