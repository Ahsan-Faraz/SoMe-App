'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { t } from '@/lib/i18n'
import { imageDataUrl } from '@/lib/image'
import { readPhoto, writePhoto, type StoredPhoto } from '../photo'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })

// B1: the profile icon next to Back. On your own profile, tap to take or upload a new picture.
export function ProfileIcon({ community, userId, name, own }: { community: string; userId: string; name: string; own: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<StoredPhoto | null>(null)
  const [sheet, setSheet] = useState(false)
  const [camera, setCamera] = useState(false)

  useEffect(() => {
    if (!own) return
    const read = () => setPhoto(readPhoto(community, userId))
    read()
    window.addEventListener('some-photo', read)
    return () => window.removeEventListener('some-photo', read)
  }, [own, community, userId])

  const icon = photo ? (
    // A captured or uploaded data URL, which next/image does not serve.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo.src} alt="" className="size-8 rounded-full object-cover" />
  ) : (
    <Avatar name={name} seed={userId} size="sm" />
  )

  if (!own) return <span className="inline-flex size-11 items-center justify-center">{icon}</span>

  async function save(file: Blob, verified: boolean) {
    writePhoto(community, userId, await imageDataUrl(file, 512), verified)
    setSheet(false)
    setCamera(false)
  }

  return (
    <>
      <button type="button" aria-label={t.profiles.replace} title={t.profiles.replace} onClick={() => setSheet(true)} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-hover">
        {icon}
      </button>
      {camera ? <CameraCapture onClose={() => setCamera(false)} onCapture={async (src) => save(await (await fetch(src)).blob(), true)} /> : null}
      {sheet && !camera ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={t.profiles.replace} onClick={() => setSheet(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-canvas p-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:mb-6 sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setCamera(true)} className="block w-full rounded-xl px-4 py-3 text-left hover:bg-hover">
              <span className="block text-[17px] font-semibold">{t.chats.camera}</span>
              <span className="mt-0.5 block text-[14px] text-muted">{t.chats.cameraNote}</span>
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="block w-full rounded-xl px-4 py-3 text-left text-[17px] font-semibold hover:bg-hover">
              {t.chats.upload}
            </button>
            <button type="button" onClick={() => setSheet(false)} className="mt-2 w-full rounded-xl bg-rail px-4 py-3 text-[16px] font-semibold text-ink hover:bg-soft-hover">
              {t.chats.cancel}
            </button>
          </div>
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void save(file, false)
        }}
      />
    </>
  )
}
