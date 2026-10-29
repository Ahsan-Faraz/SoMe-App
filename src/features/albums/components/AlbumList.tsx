'use client'

import Link from 'next/link'
import { useEffect, useOptimistic, useState, useTransition } from 'react'
import { Icon } from '@/components/ui/Icon'
import { scrollArea } from '@/components/ui/Screen'
import { t } from '@/lib/i18n'
import { NAME_MAX } from '@/lib/limits'
import { createAlbumAction, deleteAlbumAction } from '../actions'
import type { AlbumCard } from '../types'

const LONG_PRESS_MS = 450

type Change = { add: AlbumCard } | { remove: string }

// B3: a member's albums (server data). The owner adds one with "+" and deletes one with a long press
// (asked first); both show at once and go back if the database refuses them.
export function AlbumList({ community, userId, own, albums, startAdding }: { community: string; userId: string; own: boolean; albums: AlbumCard[]; startAdding: boolean }) {
  const [shown, change] = useOptimistic(albums, (current, next: Change) =>
    'add' in next ? [...current, next.add] : current.filter((album) => album.id !== next.remove),
  )
  const [adding, setAdding] = useState(startAdding)
  const [name, setName] = useState('')
  const [ask, setAsk] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  // The header "+" links to ?add=1; open the form even when this page is already showing.
  useEffect(() => {
    if (startAdding) setAdding(true)
  }, [startAdding])

  function create(trimmed: string) {
    setError('')
    setName('')
    setAdding(false)
    startTransition(async () => {
      change({ add: { id: `new-${crypto.randomUUID()}`, name: trimmed, locked: false, photos: 0, cover: null } })
      const result = await createAlbumAction(community, trimmed)
      if (result) setError(result.error)
    })
  }

  function remove(albumId: string) {
    setAsk(null)
    setError('')
    startTransition(async () => {
      change({ remove: albumId })
      const result = await deleteAlbumAction(community, albumId, null)
      if (result) setError(result.error)
    })
  }

  return (
    <div className={`${scrollArea} px-4 py-5 sm:px-8`}>
      {adding ? (
        <form
          className="mb-5 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = name.trim()
            if (trimmed) create(trimmed)
          }}
        >
          <input
            value={name}
            maxLength={NAME_MAX}
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
      {error ? (
        <p role="alert" className="mb-4 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      {shown.length === 0 ? <p className="py-10 text-center text-muted">{t.albums.empty}</p> : null}
      <ul className="grid grid-cols-2 gap-4 min-[40rem]:grid-cols-3">
        {shown.map((album) => {
          // Not saved yet: shown, but not a link until the database gives it its id.
          const saved = !album.id.startsWith('new-')
          const body = (
            <>
              {album.cover ? (
                // A signed thumbnail of an open album; a locked album never has a cover.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={album.cover} alt="" draggable={false} loading="lazy" decoding="async" className="aspect-square w-full rounded-2xl object-cover" />
              ) : (
                <span className="relative grid aspect-square w-full place-items-center rounded-2xl bg-rail text-muted">
                  <Icon name={album.locked ? 'folder' : 'image'} className="size-12" />
                  {album.locked ? (
                    <span className="absolute right-3 bottom-3 grid size-8 place-items-center rounded-full bg-canvas text-ink" aria-label={t.albums.lockedLabel} title={t.albums.lockedLabel}>
                      <Icon name="lock" className="size-4" />
                    </span>
                  ) : null}
                </span>
              )}
              <span className="mt-2 block truncate text-[15px] font-semibold">{album.name}</span>
            </>
          )
          return (
            <li key={album.id} className={saved ? undefined : 'opacity-60'}>
              {saved ? (
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
                  {body}
                </Link>
              ) : (
                <span className="block">{body}</span>
              )}
            </li>
          )
        })}
      </ul>
      {ask ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-[16px] font-semibold">{t.albums.deleteAsk}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="h-11 flex-1 rounded-xl bg-danger font-semibold text-white" onClick={() => remove(ask)}>
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
