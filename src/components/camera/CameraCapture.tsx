'use client'

import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { imageDataUrl } from '@/lib/image'

export function CameraCapture({ onCapture, onClose }: { onCapture: (src: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let stream: MediaStream | undefined
    let stopped = false
    const video = videoRef.current
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }))
      .then((next) => {
        if (stopped) {
          next.getTracks().forEach((track) => track.stop())
          return
        }
        stream = next
        if (video) video.srcObject = next
      })
      .catch(() => setError(t.camera.denied))
    return () => {
      stopped = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={t.chats.camera}>
      <div className="flex h-14 items-center px-2">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[16px] font-semibold">
          {t.common.back}
        </button>
      </div>
      <video ref={videoRef} autoPlay playsInline muted className="min-h-0 w-full flex-1 object-cover" />
      {error ? <p className="px-5 py-3 text-[15px]">{error}</p> : null}
      <div className="flex justify-center py-6">
        <button
          type="button"
          disabled={busy || Boolean(error)}
          aria-label={t.camera.shutter}
          onClick={() => {
            const video = videoRef.current
            if (!video || !video.videoWidth) return
            setBusy(true)
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            canvas.getContext('2d')?.drawImage(video, 0, 0)
            canvas.toBlob(async (blob) => {
              if (!blob) return
              onCapture(await imageDataUrl(blob, 1600))
            }, 'image/jpeg', 0.8)
          }}
          className="size-16 rounded-full border-4 border-white bg-white/30 disabled:opacity-40"
        />
      </div>
    </div>
  )
}
