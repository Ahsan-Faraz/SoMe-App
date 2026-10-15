'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { t } from '@/lib/i18n'
import type { Owner } from '../photo'
import type { ProfilePhoto } from '../types'

// The upload code and Supabase client load only when a photo is being changed.
const PhotoPicker = dynamic(() => import('./PhotoPicker').then((mod) => mod.PhotoPicker), { ssr: false })

// B1: the profile icon next to Back. On your own profile (owner set), tap to take or upload a new one.
export function ProfileIcon({ name, userId, icon, owner }: { name: string; userId: string; icon: ProfilePhoto | null; owner: Owner | null }) {
  const [open, setOpen] = useState(false)
  const avatar = <Avatar name={name} seed={userId} size="sm" src={icon?.thumb} />

  if (!owner) return <span className="inline-flex size-11 items-center justify-center">{avatar}</span>

  return (
    <>
      <button type="button" aria-label={t.profiles.replace} title={t.profiles.replace} onClick={() => setOpen(true)} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-hover">
        {avatar}
      </button>
      {open ? <PhotoPicker {...owner} slot={{ kind: 'profile' }} title={t.profiles.photo} removeId={icon?.id} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
