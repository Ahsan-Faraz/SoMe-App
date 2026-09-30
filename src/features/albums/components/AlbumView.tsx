'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { scrollArea } from '@/components/ui/Screen'
import { t } from '@/lib/i18n'
import { imageDataUrl } from '@/lib/image'
import { albumKey, loadAlbums, saveAlbums, todayLabel } from '../storage'
import type { Album, AlbumImage } from '../types'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })
const LONG_PRESS_MS = 450

export function AlbumView({ community, userId, albumId, own, seed }: { community: string; userId: string; albumId: string; own: boolean; seed: Album[] }) {
  const key = albumKey(community, userId)
  const fileRef = useRef<HTMLInputElement>(null)
  const initial = seed.find((item) => item.id === albumId) ?? null
  const [album, setAlbum] = useState<Album | null>(initial)
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(Boolean(initial && (!initial.password || own)))
  const [wrong, setWrong] = useState(false)
  const [camera, setCamera] = useState(false)
  const [ask, setAsk] = useState<string | null>(null)
  const [lock, setLock] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [askAlbum, setAskAlbum] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const found = loadAlbums(key, seed).find((item) => item.id === albumId) ?? null
    setAlbum(found)
    if (found && (!found.password || own || sessionStorage.getItem(`some:album-open:${found.id}`) === '1')) setUnlocked(true)
  }, [key, seed, albumId, own])

  function commit(next: Album) {
    const albums = loadAlbums(key, seed).map((item) => (item.id === next.id ? next : item))
    saveAlbums(key, albums)
    setAlbum(next)
  }

  function addImage(src: string, verified: boolean) {
    if (!album) return
    const image: AlbumImage = { id: `img-${Date.now()}`, src, date: todayLabel(), verified }
    commit({ ...album, images: [...album.images, image] })
    setCamera(false)
  }

  if (!album) return <p className="px-5 py-10 text-muted">{t.albums.empty}</p>

  if (!unlocked) {
    return (
      <form
        className="mx-auto grid max-w-sm gap-3 px-5 py-8"
        onSubmit={(event) => {
          event.preventDefault()
          if (password === album.password) {
            sessionStorage.setItem(`some:album-open:${album.id}`, '1')
            setUnlocked(true)
            setWrong(false)
          } else setWrong(true)
        }}
      >
        <p className="text-[16px] text-ink-soft">{t.albums.locked}</p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t.albums.password}
          aria-label={t.albums.password}
          className="h-11 rounded-xl border border-line px-3 text-[16px] outline-none focus:border-accent"
        />
        {wrong ? <p className="text-[14px] text-danger">{t.albums.wrong}</p> : null}
        <button type="submit" className="h-12 rounded-xl bg-accent font-semibold text-white">
          {t.albums.unlock}
        </button>
      </form>
    )
  }

  if (camera) return <CameraCapture onClose={() => setCamera(false)} onCapture={(src) => addImage(src, true)} />

  return (
    <div className={`${scrollArea} px-4 py-5 pb-24 sm:px-8`}>
      {own ? (
        <form
          className="mb-5 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            commit({ ...album, password: lock ?? album.password })
          }}
        >
          <input
            type="password"
            value={lock ?? album.password}
            onChange={(event) => setLock(event.target.value)}
            placeholder={album.password ? t.albums.setPassword : t.albums.password}
            aria-label={t.albums.setPassword}
            className="h-11 min-w-0 flex-1 rounded-xl border border-line px-3 text-[16px] outline-none focus:border-accent"
          />
          <button type="submit" className="h-11 rounded-xl bg-soft px-4 font-semibold">
            {t.albums.setPassword}
          </button>
        </form>
      ) : null}
      <ul className="grid gap-4">
        {album.images.map((image) => (
          <li
            key={image.id}
            // iOS: long-press is our delete; no text selection or Safari image menu (touch only).
            className="pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]"
            onContextMenu={(event) => {
              if (!own) return
              event.preventDefault()
              setAsk(image.id)
            }}
            onPointerDown={(event) => {
              if (!own) return
              const timer = window.setTimeout(() => setAsk(image.id), LONG_PRESS_MS)
              const clear = () => window.clearTimeout(timer)
              event.currentTarget.addEventListener('pointerup', clear, { once: true })
              event.currentTarget.addEventListener('pointercancel', clear, { once: true })
            }}
          >
            <span className="relative block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt="" draggable={false} className="aspect-video w-full rounded-2xl object-cover" />
              {own ? (
                <button
                  type="button"
                  aria-label={t.albums.deleteImage}
                  title={t.albums.deleteImage}
                  onClick={() => setAsk(image.id)}
                  className="absolute top-2 right-2 grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70"
                >
                  <Icon name="trash" className="size-5" />
                </button>
              ) : null}
            </span>
            <p className="mt-1 text-[14px] text-muted">{image.verified ? `✓ ${t.chats.verified} · ${image.date}` : image.date}</p>
          </li>
        ))}
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
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (file) addImage(await imageDataUrl(file, 1600), false)
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
              className="h-11 flex-1 rounded-xl bg-danger font-semibold text-white"
              onClick={() => {
                saveAlbums(key, loadAlbums(key, seed).filter((item) => item.id !== album.id))
                router.replace(`/${community}/profiles/${userId}/albums`)
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
                commit({ ...album, images: album.images.filter((image) => image.id !== ask) })
                setAsk(null)
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
