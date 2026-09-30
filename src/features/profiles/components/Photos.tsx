'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { readPhoto, type StoredPhoto } from '../photo'
import type { MainPhoto } from '../types'

const shots = [
  { src: '/community/hero.png', alt: 'Riders by the water in Stockholm', position: 'center' },
  { src: '/community/ride.png', alt: 'Two riders on a gravel path', position: 'center' },
  { src: '/community/hero.png', alt: 'The city behind the ride', position: '15% center' },
] as const

export function Photos({ main, community, userId, own }: { main: MainPhoto | null; community: string; userId: string; own: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  const [mine, setMine] = useState<StoredPhoto | null>(null)
  // Image nr 1: your own new picture (this device), else the profile's main photo.
  const first = mine ?? main
  const caption = first ? (first.verified ? `${t.chats.verified} · ${first.date}` : first.date) : ''
  const shot = open === null ? null : open === 0 && first ? { src: first.src, alt: t.profiles.photos, position: 'center' } : shots[open]

  useEffect(() => {
    if (!own) return
    const read = () => setMine(readPhoto(community, userId))
    read()
    window.addEventListener('some-photo', read)
    return () => window.removeEventListener('some-photo', read)
  }, [own, community, userId])

  return (
    <>
      <div className="grid grid-cols-3 gap-2" aria-label={t.profiles.photos}>
        {shots.map((item, slot) => (
          <button
            key={item.alt}
            type="button"
            onClick={() => setOpen(slot)}
            className="relative aspect-square overflow-hidden rounded-2xl bg-sunken text-left"
          >
            {slot === 0 && first?.src.startsWith('data:') ? (
              // The replacement is a data URL from the in-app camera.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={first.src} alt={t.profiles.photos} className="size-full object-cover" />
            ) : (
              <Image src={slot === 0 && first ? first.src : item.src} alt={item.alt} fill sizes="(min-width: 52rem) 16rem, 30vw" className="object-cover" style={{ objectPosition: item.position }} />
            )}
            {slot === 0 && caption ? (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-2 text-[11px] text-white">
                {caption}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {shot ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={shot.alt}>
          <button type="button" className="absolute inset-0" aria-label={t.common.back} onClick={() => setOpen(null)} />
          <figure className="relative z-10 w-full max-w-3xl">
            {shot.src.startsWith('data:') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.src} alt={shot.alt} className="max-h-[80dvh] w-full rounded-2xl object-cover" />
            ) : (
              <Image src={shot.src} alt={shot.alt} width={1280} height={720} className="max-h-[80dvh] w-full rounded-2xl object-cover" style={{ objectPosition: shot.position }} />
            )}
            <figcaption className="mt-3 text-center text-[13px] text-white">
              {open === 0 ? caption : shot.alt}
            </figcaption>
          </figure>
        </div>
      ) : null}
    </>
  )
}
