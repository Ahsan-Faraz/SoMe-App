'use client'

import dynamic from 'next/dynamic'
import { useRef, useState, useTransition } from 'react'
import { t } from '@/lib/i18n'
import type { ResizedImage } from '@/lib/image'
import { addPhotoAction, removePhotoAction } from '../actions'
import type { PhotoSlot } from '../photo'
import { uploadPhoto } from '../upload'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })

const option = 'block w-full rounded-xl px-4 py-3 text-left hover:bg-hover disabled:opacity-40'

// Your own profile: take a photo (Taken in app) or upload one for the icon, a main photo or a photo
// answer. The phone resizes and uploads it; the server action puts it in its place and the profile
// comes back fresh. `removeId` adds "Remove photo" for the photo already there.
export function PhotoPicker({
  slug,
  communityId,
  userId,
  slot,
  title,
  removeId = null,
  onClose,
}: {
  slug: string
  communityId: string
  userId: string
  slot: PhotoSlot
  title: string
  removeId?: string | null
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [camera, setCamera] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function save(source: Blob | ResizedImage, takenInApp: boolean) {
    setCamera(false)
    setError('')
    startTransition(async () => {
      try {
        const result = await addPhotoAction(slug, await uploadPhoto('profile', communityId, userId, source, takenInApp), slot)
        if (result) setError(result.error)
        else onClose()
      } catch {
        setError(t.profiles.photoFailed)
      }
    })
  }

  function remove(photoId: string) {
    setError('')
    startTransition(async () => {
      const result = await removePhotoAction(slug, photoId)
      if (result) setError(result.error)
      else onClose()
    })
  }

  if (camera) return <CameraCapture onClose={() => setCamera(false)} onCapture={(_, image) => save(image, true)} />

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={title} onClick={pending ? undefined : onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-canvas p-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:mb-6 sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <p className="px-4 pt-2 pb-1 text-[14px] font-semibold text-muted">{title}</p>
        <button type="button" disabled={pending} onClick={() => setCamera(true)} className={option}>
          <span className="block text-[17px] font-semibold">{t.chats.camera}</span>
          <span className="mt-0.5 block text-[14px] text-muted">{t.chats.cameraNote}</span>
        </button>
        <button type="button" disabled={pending} onClick={() => fileRef.current?.click()} className={`${option} text-[17px] font-semibold`}>
          {t.chats.upload}
        </button>
        {removeId ? (
          <button type="button" disabled={pending} onClick={() => remove(removeId)} className={`${option} text-[17px] font-semibold text-danger`}>
            {t.profiles.removePhoto}
          </button>
        ) : null}
        <p role="status" className="px-4 text-[14px]">
          {pending ? <span className="text-muted">{t.profiles.saving}</span> : error ? <span className="text-danger">{error}</span> : null}
        </p>
        <button type="button" disabled={pending} onClick={onClose} className="mt-2 w-full rounded-xl bg-rail px-4 py-3 text-[16px] font-semibold text-ink hover:bg-soft-hover disabled:opacity-40">
          {t.chats.cancel}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) save(file, false)
          }}
        />
      </div>
    </div>
  )
}
