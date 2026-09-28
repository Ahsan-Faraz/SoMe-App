'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { albumKey, loadAlbums, todayLabel } from '@/features/albums/storage'
import type { Album, AlbumImage } from '@/features/albums/types'
import { t } from '@/lib/i18n'
import { imageDataUrl } from '@/lib/image'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })

export type Shot = { src: string; verified: boolean; date: string }

export function PictureSheet({
  community,
  viewerId,
  albums,
  onClose,
  onPick,
}: {
  community: string
  viewerId: string
  albums: Album[]
  onClose: () => void
  onPick: (shot: Shot) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [camera, setCamera] = useState(false)
  const [picking, setPicking] = useState(false)
  const [photos, setPhotos] = useState<AlbumImage[]>([])

  useEffect(() => {
    if (!picking) return
    const stored = loadAlbums(albumKey(community, viewerId), albums)
    setPhotos(stored.flatMap((album) => album.images))
  }, [picking, community, viewerId, albums])

  if (camera) {
    return <CameraCapture onClose={() => setCamera(false)} onCapture={(src) => onPick({ src, verified: true, date: todayLabel() })} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={t.chats.addPicture} onClick={onClose}>
      <div className="max-h-[80dvh] w-full overflow-y-auto rounded-t-3xl bg-canvas pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl lg:h-full lg:max-w-md lg:rounded-none lg:pb-6" onClick={(event) => event.stopPropagation()}>
        <span className="mx-auto mt-2 block h-1 w-10 rounded-full bg-line-strong lg:hidden" />
        {picking ? (
          photos.length === 0 ? (
            <p className="px-5 py-8 text-[16px] text-muted">{t.albums.noPhotos}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 p-4">
              {photos.map((photo) => (
                <li key={photo.id}>
                  <button type="button" onClick={() => onPick({ src: photo.src, verified: photo.verified, date: photo.date })} className="block w-full text-left">
                    {/* Album covers may be a static path or a captured data URL. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.src} alt="" className="aspect-square w-full rounded-xl object-cover" />
                    <span className="mt-1 block text-[13px] text-muted">{photo.verified ? `✓ ${t.chats.verified} · ${photo.date}` : photo.date}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <ul className="mt-2 divide-y divide-line">
            <li>
              <button type="button" onClick={() => setCamera(true)} className="block w-full px-5 py-4 text-left hover:bg-sunken">
                <span className="block text-[17px] font-semibold">{t.chats.camera}</span>
                <span className="mt-0.5 block text-[14px] text-muted">{t.chats.cameraNote}</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => fileRef.current?.click()} className="block w-full px-5 py-4 text-left text-[17px] font-semibold hover:bg-sunken">
                {t.chats.upload}
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setPicking(true)} className="block w-full px-5 py-4 text-left text-[17px] font-semibold hover:bg-sunken">
                {t.chats.fromAlbum}
              </button>
            </li>
          </ul>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            onPick({ src: await imageDataUrl(file, 1600), verified: false, date: todayLabel() })
          }}
        />
      </div>
    </div>
  )
}
