'use client'

import dynamic from 'next/dynamic'
import { useOptimistic, useRef, useState, useTransition } from 'react'
import { Icon } from '@/components/ui/Icon'
import { scrollArea } from '@/components/ui/Screen'
import { t } from '@/lib/i18n'
import type { ResizedImage } from '@/lib/image'
import { addAlbumPhotoAction, deleteAlbumAction, openAlbumAction, removeAlbumPhotoAction, setAlbumPasswordAction } from '../actions'
import type { AlbumDetail, AlbumPhoto } from '../types'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })
const LONG_PRESS_MS = 450

// A password for the album actions, inside a FormData so no server log shows it.
function secret(password: string) {
  const form = new FormData()
  form.set('password', password)
  return form
}

type Change = { add: AlbumPhoto } | { remove: string }

// B4: one album (server data; photos are signed links). Locked: the password form, checked in the
// database (open for an hour when right). The owner adds photos (camera = Taken in app, or upload:
// resized on the phone, uploaded to their folder, then added), deletes them and the album (asked
// first), and sets or removes the password. Changes show at once; the page then comes back saved.
export function AlbumView({
  community,
  communityId,
  viewerId,
  album,
  listHref,
}: {
  community: string
  communityId: string
  viewerId: string
  album: AlbumDetail
  listHref: string
}) {
  const own = album.access === 'owner'
  const fileRef = useRef<HTMLInputElement>(null)
  const [photos, change] = useOptimistic(album.photos, (current, next: Change) =>
    'add' in next ? [...current, next.add] : current.filter((photo) => photo.id !== next.remove),
  )
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [camera, setCamera] = useState(false)
  const [ask, setAsk] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [askAlbum, setAskAlbum] = useState(false)
  const [pending, startTransition] = useTransition()

  const run = (work: () => Promise<{ error: string } | undefined>) => {
    setError('')
    startTransition(async () => {
      const result = await work()
      if (result) setError(result.error)
    })
  }

  function addPhoto(source: Blob | ResizedImage, verified: boolean) {
    setCamera(false)
    const preview = URL.createObjectURL(source instanceof Blob ? source : source.blob)
    run(async () => {
      change({ add: { id: `new-${preview}`, src: preview, width: null, height: null, verified, date: t.albums.uploading } })
      try {
        const { uploadPhoto } = await import('@/features/profiles/upload')
        const photo = await uploadPhoto('private', communityId, viewerId, source, verified)
        return await addAlbumPhotoAction(community, album.id, { path: photo.path, thumb_path: photo.thumbPath, width: photo.width, height: photo.height, taken_in_app: photo.takenInApp })
      } catch {
        return { error: t.albums.notSaved }
      } finally {
        // Kept until the saved photo has replaced the preview.
        window.setTimeout(() => URL.revokeObjectURL(preview), 30_000)
      }
    })
  }

  if (album.access === 'locked') {
    return (
      <form
        className="mx-auto grid max-w-sm gap-3 px-5 py-8"
        onSubmit={(event) => {
          event.preventDefault()
          if (password) run(() => openAlbumAction(community, album.id, secret(password)))
        }}
      >
        <p className="text-[16px] text-ink-soft">{t.albums.locked}</p>
        <input
          type="password"
          value={password}
          maxLength={72}
          autoComplete="off"
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t.albums.password}
          aria-label={t.albums.password}
          className="h-11 rounded-xl border border-line px-3 text-[16px] outline-none focus:border-accent"
        />
        {error ? (
          <p role="alert" className="text-[14px] text-danger">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className="h-12 rounded-xl bg-accent font-semibold text-white disabled:opacity-50">
          {t.albums.unlock}
        </button>
      </form>
    )
  }

  if (camera) return <CameraCapture onClose={() => setCamera(false)} onCapture={(_src, image) => addPhoto(image, true)} />

  return (
    <div className={`${scrollArea} px-4 py-5 pb-24 sm:px-8`}>
      {own ? (
        <form
          className="mb-5 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!password) return
            const next = password
            setPassword('')
            run(() => setAlbumPasswordAction(community, album.id, secret(next)))
          }}
        >
          {album.locked ? <p className="text-[14px] text-muted">{t.albums.passwordOn}</p> : null}
          <span className="flex gap-2">
            <input
              type="password"
              value={password}
              maxLength={72}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t.albums.password}
              aria-label={t.albums.setPassword}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line px-3 text-[16px] outline-none focus:border-accent"
            />
            <button type="submit" disabled={pending} className="h-11 rounded-xl bg-soft px-4 font-semibold disabled:opacity-50">
              {t.albums.setPassword}
            </button>
          </span>
          {album.locked ? (
            <button type="button" disabled={pending} onClick={() => run(() => setAlbumPasswordAction(community, album.id, secret('')))} className="justify-self-start text-[15px] font-semibold text-accent disabled:opacity-50">
              {t.albums.removePassword}
            </button>
          ) : null}
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="mb-4 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      {photos.length === 0 ? <p className="py-10 text-center text-muted">{t.albums.noPhotos}</p> : null}
      <ul className="grid gap-4">
        {photos.map((photo) => {
          const saved = !photo.id.startsWith('new-')
          return (
            <li
              key={photo.id}
              // iOS: long-press is our delete; no text selection or Safari image menu (touch only).
              className={`pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none] ${saved ? '' : 'opacity-60'}`}
              onContextMenu={(event) => {
                if (!own || !saved) return
                event.preventDefault()
                setAsk(photo.id)
              }}
              onPointerDown={(event) => {
                if (!own || !saved) return
                const timer = window.setTimeout(() => setAsk(photo.id), LONG_PRESS_MS)
                const clear = () => window.clearTimeout(timer)
                event.currentTarget.addEventListener('pointerup', clear, { once: true })
                event.currentTarget.addEventListener('pointercancel', clear, { once: true })
              }}
            >
              <span className="relative block">
                {/* A signed link (an hour), or the photo being added. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.src} alt="" draggable={false} loading="lazy" decoding="async" className="aspect-video w-full rounded-2xl bg-sunken object-cover" />
                {own && saved ? (
                  <button
                    type="button"
                    aria-label={t.albums.deleteImage}
                    title={t.albums.deleteImage}
                    onClick={() => setAsk(photo.id)}
                    className="absolute top-2 right-2 grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70"
                  >
                    <Icon name="trash" className="size-5" />
                  </button>
                ) : null}
              </span>
              {photo.verified || photo.date ? (
                <p className="mt-1 text-[14px] text-muted">{photo.verified ? `✓ ${t.chats.takenInApp} · ${photo.date}` : photo.date}</p>
              ) : null}
            </li>
          )
        })}
      </ul>
      {own ? (
        <button
          type="button"
          aria-label={t.albums.addImage}
          aria-expanded={menu}
          onClick={() => setMenu(true)}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg"
        >
          <Icon name="plus" />
        </button>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) addPhoto(file, false)
        }}
      />
      {menu ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={t.albums.addImage} onClick={() => setMenu(false)}>
          <div className="w-full max-w-md select-none rounded-t-3xl bg-canvas p-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:mb-6 sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => (setMenu(false), setCamera(true))} className="block w-full rounded-xl px-4 py-3 text-left hover:bg-hover">
              <span className="block text-[17px] font-semibold">{t.chats.camera}</span>
              <span className="mt-0.5 block text-[14px] text-muted">{t.chats.cameraNote}</span>
            </button>
            <button type="button" onClick={() => (setMenu(false), fileRef.current?.click())} className="block w-full rounded-xl px-4 py-3 text-left text-[17px] font-semibold hover:bg-hover">
              {t.albums.uploadImage}
            </button>
            <button type="button" onClick={() => (setMenu(false), setAskAlbum(true))} className="block w-full rounded-xl px-4 py-3 text-left text-[17px] font-semibold text-danger hover:bg-hover">
              {t.albums.deleteAlbum}
            </button>
            <button type="button" onClick={() => setMenu(false)} className="mt-2 w-full rounded-xl bg-rail px-4 py-3 text-[16px] font-semibold text-ink hover:bg-soft-hover">
              {t.chats.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {askAlbum ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="font-semibold">{t.albums.deleteAsk}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="h-11 flex-1 rounded-xl bg-danger font-semibold text-white disabled:opacity-50"
              onClick={() => {
                setAskAlbum(false)
                run(() => deleteAlbumAction(community, album.id, listHref))
              }}
            >
              {t.albums.confirm}
            </button>
            <button type="button" className="h-11 flex-1 rounded-xl bg-soft font-semibold" onClick={() => setAskAlbum(false)}>
              {t.chats.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {ask ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="font-semibold">{t.albums.deleteImage}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="h-11 flex-1 rounded-xl bg-danger font-semibold text-white"
              onClick={() => {
                const photoId = ask
                setAsk(null)
                run(async () => {
                  change({ remove: photoId })
                  return removeAlbumPhotoAction(community, photoId)
                })
              }}
            >
              {t.albums.confirm}
            </button>
            <button type="button" className="h-11 flex-1 rounded-xl bg-soft font-semibold" onClick={() => setAsk(null)}>
              {t.chats.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
