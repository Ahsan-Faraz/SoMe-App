'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import type { Owner } from '../photo'
import type { ProfilePhoto } from '../types'
import { FullPhoto } from './FullPhoto'

// The upload code and Supabase client load only when the photo is being changed.
const PhotoPicker = dynamic(() => import('./PhotoPicker').then((mod) => mod.PhotoPicker), { ssr: false })

// The profile image: the icon and the photo on the Profiles list, shown full width at its place in
// the profile. On your own profile (owner set) it can be taken, uploaded, changed or removed.
export function ProfileImage({ photo, owner, eager = false }: { photo: ProfilePhoto | null; owner: Owner | null; eager?: boolean }) {
  const [picking, setPicking] = useState(false)
  if (!photo && !owner) return null

  return (
    <div className="grid gap-2">
      {photo ? <FullPhoto photo={photo} alt={t.profiles.photo} eager={eager} /> : null}
      {owner ? (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={
            photo
              ? 'inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-soft px-3 text-[15px] font-semibold hover:bg-soft-hover'
              : 'flex aspect-[4/3] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong text-[15px] font-semibold text-muted hover:bg-hover'
          }
        >
          <Icon name={photo ? 'image' : 'plus'} className="size-5" />
          {photo ? t.profiles.replace : t.profiles.addPhoto}
        </button>
      ) : null}
      {owner && picking ? <PhotoPicker {...owner} slot={{ kind: 'profile' }} title={t.profiles.photo} removeId={photo?.id} onClose={() => setPicking(false)} /> : null}
    </div>
  )
}
