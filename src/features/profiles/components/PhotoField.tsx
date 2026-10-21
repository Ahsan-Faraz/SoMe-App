'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { FieldDef } from '@/features/fields/types'
import { t } from '@/lib/i18n'
import type { PersonRef } from '../actions'
import type { Owner } from '../photo'
import type { ProfilePhoto } from '../types'
import { RequiredTag } from './FieldInput'
import { FullPhoto } from './FullPhoto'

// The upload code and Supabase client load only when a photo is being changed.
const PhotoPicker = dynamic(() => import('./PhotoPicker').then((mod) => mod.PhotoPicker), { ssr: false })

// A photo answer on your own profile, full width at its place. Saved as soon as it is taken or
// uploaded, not with the form.
export function PhotoField({ owner, field, person, label, photo }: { owner: Owner; field: FieldDef; person: PersonRef; label: string; photo: ProfilePhoto | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="grid gap-1.5">
      <span className="text-[14px] font-semibold text-ink">
        {label}
        {field.required ? <RequiredTag /> : null}
      </span>
      {photo ? <FullPhoto photo={photo} alt={label} /> : null}
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-soft px-3 text-[15px] font-semibold hover:bg-soft-hover">
        <Icon name={photo ? 'image' : 'plus'} className="size-4" />
        {photo ? t.profiles.replace : t.profiles.addPhoto}
      </button>
      {open ? <PhotoPicker {...owner} slot={{ kind: 'field', fieldId: field.id, substatusId: person.substatusId, n: person.n }} title={label} removeId={photo?.id} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}
