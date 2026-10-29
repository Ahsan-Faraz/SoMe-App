'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRef, useState, useTransition, type FormEvent } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { GrowingTextarea } from '@/components/ui/GrowingTextarea'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import { formatDay } from '@/lib/format'
import { t } from '@/lib/i18n'
import { blobDataUrl, resizeImage, type ResizedImage } from '@/lib/image'
import { IMAGE_FULL_PX } from '@/lib/limits'
import type { UploadedPhoto } from '@/features/profiles/photo'
import { applyToGroupAction, submitApplicationAction } from '../actions'
import { REAL_NAMES, type ApplicationImage, type Scope, type SentApplication } from '../types'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })

const field = 'w-full min-w-0 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] text-ink outline-none focus:border-accent'

// The chosen image: a preview, the resized file to upload when the application is sent,
// and the upload once done (a refused try keeps it, so the next try doesn't upload it again).
type PickedImage = ApplicationImage & { file: ResizedImage | null; uploaded?: UploadedPhoto }

// A24 (apply to a group that is not "direct join") and A25 (apply to the community, before approval).
// Image, ID photo (identity check, D31), text and names show only when the group/community asks for
// them. Apply saves it in the database (the images go to the private bucket first) and adds it to the
// admin's queue (the community admin's, or the group admin's); `applied` comes from the server and
// dims the button. Community (A25) also shows what was sent and the profile fields still to fill in.
export function ApplicationForm({
  community,
  communityId,
  scope,
  applicantId,
  applied = false,
  sent = null,
  missing = [],
  profileHref = null,
  chatHref = null,
}: {
  community: string
  communityId: string // where the images are uploaded
  scope: Pick<Scope, 'kind' | 'id' | 'applicationText' | 'requires'> // a group: id is its chat id
  applicantId: string
  applied?: boolean // already applied (community: members.state; group: an open application)
  sent?: SentApplication | null // community, once applied: what was sent
  missing?: string[] // community: required profile fields still empty (Status first)
  profileHref?: string | null // A25: Create / edit profile
  chatHref?: string | null // A25: only once the admin has written to you
}) {
  const toCommunity = scope.kind === 'community'
  // Which image the camera is taking: the application image or the ID photo.
  const [camera, setCamera] = useState<Slot | null>(null)
  const [image, setImage] = useState<PickedImage | null>(() => (sent?.image ? { ...sent.image, file: null } : null))
  const [idImage, setIdImage] = useState<PickedImage | null>(() => (sent?.idImage ? { ...sent.idImage, file: null } : null))
  const [message, setMessage] = useState(sent?.message ?? '')
  const [names, setNames] = useState<string[]>(() => Array.from({ length: REAL_NAMES }, (_, i) => sent?.realNames[i] ?? ''))
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const { requires } = scope

  const setSlot = (slot: Slot) => (slot === 'image' ? setImage : setIdImage)

  async function pick(slot: Slot, file: Blob, verified: boolean) {
    const resized = await resizeImage(file, IMAGE_FULL_PX)
    setSlot(slot)({ src: await blobDataUrl(resized.blob), verified, date: formatDay(), file: resized })
  }

  // The picked image in the private bucket (once: a refused try keeps the upload for the next).
  async function upload(slot: Slot, picked: PickedImage | null): Promise<UploadedPhoto | null> {
    if (!picked?.file || picked.uploaded) return picked?.uploaded ?? null
    // Loaded only now: the upload code and Supabase client stay out of the form's first load.
    const { uploadPhoto } = await import('@/features/profiles/upload')
    const uploaded = await uploadPhoto('private', communityId, applicantId, picked.file, picked.verified)
    setSlot(slot)((current) => (current && current.file === picked.file ? { ...current, uploaded } : current))
    return uploaded
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (applied || pending) return
    if (missing.length) {
      setError(t.apply.profileMissing(missing))
      return
    }
    if ((requires.image && !image) || (requires.identity && !idImage) || (requires.text && !message.trim()) || (requires.names && !names[0]?.trim())) {
      setError(t.apply.missing)
      return
    }
    setError('')
    startTransition(async () => {
      let photos: [UploadedPhoto | null, UploadedPhoto | null]
      try {
        photos = await Promise.all([upload('image', image), upload('id', idImage)])
      } catch {
        setError(t.apply.imageFailed)
        return
      }
      const input = { photo: photos[0], idPhoto: photos[1], message, realNames: names }
      const result = toCommunity ? await submitApplicationAction(community, input) : await applyToGroupAction(community, scope.id, input)
      if (result) setError(result.error)
    })
  }

  if (camera) {
    return (
      <CameraCapture
        onClose={() => setCamera(null)}
        onCapture={(src, file) => {
          setSlot(camera)({ src, verified: true, date: formatDay(), file })
          setCamera(null)
        }}
      />
    )
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className={scrollArea}>
        <fieldset disabled={applied} className="mx-auto grid max-w-lg gap-5 px-4 py-6 sm:px-8">
          {scope.applicationText ? <p className="text-[16px] leading-relaxed whitespace-pre-wrap text-ink-soft">{scope.applicationText}</p> : null}
          {missing.length && !applied ? (
            <div role="status" className="rounded-2xl border border-accent/40 bg-sunken p-4 text-[15px]">
              <p className="font-semibold">{t.apply.missingFields}</p>
              <ul className="mt-1 list-disc pl-5 text-ink-soft">
                {missing.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {profileHref ? (
            <Link href={profileHref} className={buttonClass('secondary')}>
              {t.apply.editProfile}
            </Link>
          ) : null}
          {applied && sent ? <h2 className="-mb-2 text-[17px] font-bold">{t.apply.sent}</h2> : null}

          {requires.image ? (
            <ImageSlot
              title={t.apply.image}
              hint={t.apply.imageHint}
              image={image}
              applied={applied}
              onCamera={() => setCamera('image')}
              onFile={(file) => pick('image', file, false)}
              onClear={() => setImage(null)}
            />
          ) : null}

          {requires.identity ? (
            <ImageSlot
              title={t.apply.idPhoto}
              hint={t.apply.idPhotoHint}
              image={idImage}
              applied={applied}
              onCamera={() => setCamera('id')}
              onFile={(file) => pick('id', file, false)}
              onClear={() => setIdImage(null)}
            />
          ) : null}

          {requires.text ? (
            <label className="grid gap-1.5 text-[14px] font-semibold">
              {t.apply.text}
              <GrowingTextarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className={`${field} min-h-28 py-2.5 leading-normal`} />
            </label>
          ) : null}

          {requires.names ? (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-1.5 text-[14px] font-semibold">{t.apply.names}</legend>
              {names.map((name, index) => (
                <input
                  key={index}
                  value={name}
                  required={index === 0}
                  autoComplete={index === 0 ? 'name' : 'off'}
                  aria-label={t.apply.name(index + 1)}
                  placeholder={index === 0 ? t.apply.name(1) : `${t.apply.name(index + 1)} (${t.apply.optional})`}
                  onChange={(event) => setNames((current) => current.map((item, i) => (i === index ? event.target.value : item)))}
                  className={`${field} h-11`}
                />
              ))}
            </fieldset>
          ) : null}

          {error ? (
            <p role="alert" className="text-[15px] font-semibold text-danger">
              {error}
            </p>
          ) : null}
        </fieldset>
      </div>
      <div className={bottomBar}>
        <div className="mx-auto grid max-w-lg gap-2">
          {chatHref ? (
            <Link href={chatHref} className={buttonClass('secondary')}>
              {t.apply.chatAdmin}
            </Link>
          ) : null}
          <button type="submit" disabled={applied || pending} className={`${buttonClass('primary')} disabled:opacity-50`}>
            {applied ? t.apply.applied : pending ? t.apply.sending : t.apply.submit}
          </button>
        </div>
      </div>
    </form>
  )
}

type Slot = 'image' | 'id'

// One image of the application: the preview with its date (and "Taken in app" from the camera), or
// the camera / upload buttons.
function ImageSlot({
  title,
  hint,
  image,
  applied,
  onCamera,
  onFile,
  onClear,
}: {
  title: string
  hint: string
  image: PickedImage | null
  applied: boolean
  onCamera: () => void
  onFile: (file: Blob) => Promise<void>
  onClear: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <section className="grid gap-2">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      {image ? (
        <figure>
          {/* A capture or upload as a data URL, or a signed URL once sent. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={title} className="h-auto max-h-[70dvh] w-full rounded-2xl bg-sunken object-contain" />
          <figcaption className="mt-1 flex items-center justify-between gap-2 text-[13px]">
            <span className={image.verified ? 'font-semibold text-accent' : 'text-muted'}>{image.verified ? `✓ ${t.chats.takenInApp} · ${image.date}` : image.date}</span>
            {applied ? null : (
              <button type="button" onClick={onClear} className="rounded-lg px-2 py-1 font-semibold text-accent hover:bg-hover">
                {t.apply.change}
              </button>
            )}
          </figcaption>
        </figure>
      ) : (
        <div className="grid gap-3 rounded-2xl border-2 border-dashed border-line-strong p-4">
          <p className="text-[14px] text-muted">{hint}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onCamera} className="grid min-h-14 content-center rounded-xl bg-accent px-2 py-2 text-center text-white hover:bg-accent-hover">
              <span className="text-[15px] font-semibold">{t.chats.camera}</span>
              <span className="text-[12px] leading-tight text-white/85">{t.chats.cameraTag}</span>
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="min-h-14 rounded-xl bg-soft px-2 text-[15px] font-semibold hover:bg-soft-hover">
              {t.chats.upload}
            </button>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) await onFile(file)
        }}
      />
    </section>
  )
}
