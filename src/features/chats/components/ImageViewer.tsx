'use client'

import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'

// A chat image full size (tapped from its thumbnail): the signed full file over the chat, with
// "Taken in app" and its date when it was taken with the in-app camera (D16, D18).
export function ImageViewer({ src, verified, date, onClose }: { src: string; verified: boolean; date: string | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={t.chats.picture} onClick={onClose}>
      <div className="flex shrink-0 justify-end p-2">
        <button type="button" aria-label={t.chats.cancel} onClick={onClose} className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10">
          <Icon name="x" className="size-6" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        {/* A signed Storage file, already resized on the phone: no image optimizer round trip. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={t.chats.picture} className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
      </div>
      <p className={`shrink-0 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-[14px] ${verified ? 'font-semibold text-white' : 'text-white/70'}`}>
        {verified ? `✓ ${t.chats.takenInApp}${date ? ` · ${date}` : ''}` : (date ?? '')}
      </p>
    </div>
  )
}
