'use client'

import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { blobDataUrl, resizeImage, type ResizedImage } from '@/lib/image'
import { IMAGE_FULL_PX } from '@/lib/limits'

type Phase = 'starting' | 'paused' | 'ready' | 'busy' | 'error'

// Why the camera didn't start, in words the person can act on.
function startError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return t.camera.denied
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return t.camera.none
  if (name === 'NotReadableError' || name === 'AbortError') return t.camera.inUse
  return t.camera.failed
}

// The in-app camera. onCapture gets the photo as a data URL (for screens that keep it in memory) and
// as the resized file (to upload). Every failure shows a message and "Try again": the screen never
// just stays black or stops answering (client feedback 261111).
export function CameraCapture({ onCapture, onClose }: { onCapture: (src: string, image: ResizedImage) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0) // "Try again" starts the camera once more

  useEffect(() => {
    let stream: MediaStream | undefined
    let stopped = false
    const video = videoRef.current
    const fail = (message: string) => {
      if (stopped) return
      setError(message)
      setPhase('error')
    }

    async function start() {
      // In-app browsers (links opened inside another app) and pages without HTTPS have no camera.
      if (!navigator.mediaDevices?.getUserMedia) return fail(t.camera.unsupported)
      try {
        const next = await navigator.mediaDevices
          .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
          .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }))
        if (stopped || !video) {
          next.getTracks().forEach((track) => track.stop())
          return
        }
        stream = next
        video.srcObject = next
        // iOS doesn't always start a stream by `autoplay` alone, and a stream that isn't playing
        // photographs as a black picture. If the phone refuses to start it without a tap (Low Power
        // Mode), the person starts it with the button.
        await video.play().catch(() => {
          if (!stopped) setPhase('paused')
        })
      } catch (cause) {
        fail(startError(cause))
      }
    }
    void start()

    return () => {
      stopped = true
      stream?.getTracks().forEach((track) => track.stop())
      if (video) video.srcObject = null
    }
  }, [attempt])

  async function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth || video.paused) return
    setPhase('busy')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      const frame = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (!frame) throw new Error('no frame')
      const image = await resizeImage(frame, IMAGE_FULL_PX)
      onCapture(await blobDataUrl(image.blob), image)
    } catch {
      setError(t.camera.captureFailed)
      setPhase('ready')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={t.chats.camera}>
      <div className="flex h-14 items-center px-2">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[16px] font-semibold">
          {t.common.back}
        </button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        // The picture can be taken once the stream is really playing (not only loaded).
        onPlaying={() => setPhase((current) => (current === 'starting' || current === 'paused' ? 'ready' : current))}
        className="min-h-0 w-full flex-1 object-cover"
      />
      <div role="status" className="min-h-6 px-5 pt-3 text-center text-[15px]">
        {phase === 'starting' ? t.camera.starting : error}
      </div>
      <div className="flex items-center justify-center gap-4 py-6">
        {phase === 'error' ? (
          <button
            type="button"
            onClick={() => {
              setError('')
              setPhase('starting')
              setAttempt((count) => count + 1)
            }}
            className="h-12 rounded-full bg-white px-6 text-[16px] font-semibold text-black"
          >
            {t.common.tryAgain}
          </button>
        ) : phase === 'paused' ? (
          <button type="button" onClick={() => void videoRef.current?.play().catch(() => undefined)} className="h-12 rounded-full bg-white px-6 text-[16px] font-semibold text-black">
            {t.camera.start}
          </button>
        ) : (
          <button
            type="button"
            disabled={phase !== 'ready'}
            aria-label={t.camera.shutter}
            onClick={() => void capture()}
            className="size-16 rounded-full border-4 border-white bg-white/30 disabled:opacity-40"
          />
        )}
      </div>
    </div>
  )
}
