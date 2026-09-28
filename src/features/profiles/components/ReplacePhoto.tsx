'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { imageDataUrl } from '@/lib/image'
import { writePhoto } from '../photo'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })

export function ReplacePhoto({ community, userId }: { community: string; userId: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label={t.profiles.replace}
        title={t.profiles.replace}
        onClick={() => setOpen(true)}
        className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover"
      >
        <Icon name="camera" />
      </button>
      {open ? (
        <CameraCapture
          onClose={() => setOpen(false)}
          onCapture={async (src) => {
            writePhoto(community, userId, await imageDataUrl(await (await fetch(src)).blob(), 512))
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
