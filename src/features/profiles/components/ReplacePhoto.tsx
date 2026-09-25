'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'

export function ReplacePhoto() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t.profiles.replace}
        title={t.profiles.replace}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-black/5"
      >
        <Icon name="camera" />
      </button>
      {open ? (
        <p role="status" className="absolute top-12 right-0 z-20 w-56 rounded-xl bg-ink px-3 py-2 text-[13px] text-white shadow-lg">
          {t.profiles.replaceNote}
        </p>
      ) : null}
    </div>
  )
}
