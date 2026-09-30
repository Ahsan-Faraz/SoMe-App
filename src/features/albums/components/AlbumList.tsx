'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { scrollArea } from '@/components/ui/Screen'
import { t } from '@/lib/i18n'
import { albumKey, loadAlbums, saveAlbums } from '../storage'
import type { Album } from '../types'

const LONG_PRESS_MS = 450

export function AlbumList({ community, userId, own, seed, startAdding }: { community: string; userId: string; own: boolean; seed: Album[]; startAdding: boolean }) {
  const key = albumKey(community, userId)
  const [albums, setAlbums] = useState(seed)
  const [adding, setAdding] = useState(startAdding)
  const [name, setName] = useState('')
  const [ask, setAsk] = useState<string | null>(null)

  useEffect(() => setAlbums(loadAlbums(key, seed)), [key, seed])
  // The header "+" links to ?add=1; open the form even when this page is already showing.
  useEffect(() => {
    if (startAdding) setAdding(true)
  }, [startAdding])

  function commit(next: Album[]) {
    setAlbums(next)
    saveAlbums(key, next)
  }

  return (
    <div className={`${scrollArea} px-4 py-5 sm:px-8`}>
      {adding ? (
        <form
          className="mb-5 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = name.trim()
            if (!trimmed) return
            commit([...albums, { id: `album-${Date.now()}`, name: trimmed, password: '', images: [] }])
            setName('')
            setAdding(false)
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.albums.name}
            aria-label={t.albums.name}
            className="h-11 min-w-0 flex-1 rounded-xl border border-line px-3 text-[16px] outline-none focus:border-accent"
          />
          <button type="submit" className="h-11 rounded-xl bg-accent px-4 font-semibold text-white">
            {t.albums.create}
          </button>
        </form>
      ) : null}
      {albums.length === 0 ? <p className="py-10 text-center text-muted">{t.albums.empty}</p> : null}
      <ul className="grid grid-cols-2 gap-4 min-[40rem]:grid-cols-3">
        {albums.map((album) => {
          // Locked albums never show a photo, only a folder, until the password is given.
          const cover = album.password ? undefined : album.images[0]?.src
          return (
            <li key={album.id}>
              <Link
                href={`/${community}/profiles/${userId}/albums/${album.id}`}
                // iOS: long-press is our delete; no text selection or Safari link/image menu (touch only).
                className="block pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]"
                onContextMenu={(event) => {
                  if (!own) return
                  event.preventDefault()
                  setAsk(album.id)
                }}
                onPointerDown={(event) => {
                  if (!own) return
                  const timer = window.setTimeout(() => setAsk(album.id), LONG_PRESS_MS)
                  const clear = () => window.clearTimeout(timer)
                  event.currentTarget.addEventListener('pointerup', clear, { once: true })
                  event.currentTarget.addEventListener('pointercancel', clear, { once: true })
                }}
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" draggable={false} className="aspect-square w-full rounded-2xl object-cover" />
                ) : (
                  <span className="relative grid aspect-square w-full place-items-center rounded-2xl bg-rail text-muted">
                    <Icon name={album.password ? 'folder' : 'image'} className="size-12" />
                    {album.password ? (
                      <span className="absolute right-3 bottom-3 grid size-8 place-items-center rounded-full bg-canvas text-ink" aria-label={t.albums.lockedLabel} title={t.albums.lockedLabel}>
                        <Icon name="lock" className="size-4" />
                      </span>
                    ) : null}
                  </span>
                )}
                <span className="mt-2 block truncate text-[15px] font-semibold">{album.name}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      {ask ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-[16px] font-semibold">{t.albums.deleteAsk}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="h-11 flex-1 rounded-xl bg-danger font-semibold text-white"
              onClick={() => {
                commit(albums.filter((album) => album.id !== ask))
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
