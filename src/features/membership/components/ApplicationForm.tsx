'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { GrowingTextarea } from '@/components/ui/GrowingTextarea'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import { todayLabel } from '@/features/albums/storage'
import { t } from '@/lib/i18n'
import { imageDataUrl } from '@/lib/image'
import { applicationKey, readApplication, saveApplication } from '../storage'
import { REAL_NAMES, STATE_FIELDS, type ApplicationImage, type Scope } from '../types'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })

const field = 'w-full min-w-0 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] text-ink outline-none focus:border-accent'

// A24 (apply to a group that is not "direct join") and A25 (apply to the community, before approval).
// Image, text and names show only when the group/community asks for them. Apply adds it to the
// admin's application list; the button dims once you have applied.
export function ApplicationForm({
  community,
  scope,
  applicant,
  profileHref = null,
  chatHref = null,
}: {
  community: string
  scope: Pick<Scope, 'kind' | 'id' | 'applicationText' | 'requires'>
  applicant: { userId: string; username: string; status: string }
  profileHref?: string | null // A25: Create / edit profile
  chatHref?: string | null // A25: only once the admin has written to you
}) {
  const key = applicationKey(community, scope)
  const fileRef = useRef<HTMLInputElement>(null)
  const [camera, setCamera] = useState(false)
  const [image, setImage] = useState<ApplicationImage | null>(null)
  const [message, setMessage] = useState('')
  const [names, setNames] = useState<string[]>(() => Array.from({ length: REAL_NAMES }, () => ''))
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState('')
  const { requires } = scope

  useEffect(() => setApplied(readApplication(key) !== null), [key])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (applied) return
    if ((requires.image && !image) || (requires.text && !message.trim()) || (requires.names && !names[0]?.trim())) {
      setError(t.apply.missing)
      return
    }
    saveApplication(key, {
      ...applicant,
      realNames: names.map((name) => name.trim()),
      state: Array.from({ length: STATE_FIELDS }, () => ''),
      notes: '',
      image,
      message: message.trim(),
      applied: true,
    })
    setApplied(true)
    setError('')
  }

  if (camera) {
    return (
      <CameraCapture
        onClose={() => setCamera(false)}
        onCapture={(src) => {
          setImage({ src, verified: true, date: todayLabel() })
          setCamera(false)
        }}
      />
    )
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className={scrollArea}>
        <fieldset disabled={applied} className="mx-auto grid max-w-lg gap-5 px-4 py-6 sm:px-8">
          {scope.applicationText ? <p className="text-[16px] leading-relaxed whitespace-pre-wrap text-ink-soft">{scope.applicationText}</p> : null}
          {profileHref ? (
            <Link href={profileHref} className={buttonClass('secondary')}>
              {t.apply.editProfile}
            </Link>
          ) : null}

          {requires.image ? (
            <section className="grid gap-2">
              <h2 className="text-[14px] font-semibold">{t.apply.image}</h2>
              {image ? (
                <figure>
                  {/* A capture or upload as a data URL. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.src} alt={t.apply.image} className="aspect-video w-full rounded-2xl object-cover" />
                  <figcaption className="mt-1 flex items-center justify-between gap-2 text-[13px]">
                    <span className={image.verified ? 'font-semibold text-accent' : 'text-muted'}>{image.verified ? `✓ ${t.chats.verified} · ${image.date}` : image.date}</span>
                    {applied ? null : (
                      <button type="button" onClick={() => setImage(null)} className="rounded-lg px-2 py-1 font-semibold text-accent hover:bg-hover">
                        {t.apply.change}
                      </button>
                    )}
                  </figcaption>
                </figure>
              ) : (
                <div className="grid gap-3 rounded-2xl border-2 border-dashed border-line-strong p-4">
                  <p className="text-[14px] text-muted">{t.apply.imageHint}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setCamera(true)} className="grid min-h-14 content-center rounded-xl bg-accent px-2 py-2 text-center text-white hover:bg-accent-hover">
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
                  if (file) setImage({ src: await imageDataUrl(file, 1600), verified: false, date: todayLabel() })
                }}
              />
            </section>
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
          <button type="submit" disabled={applied} className={buttonClass('primary')}>
            {applied ? t.apply.applied : t.apply.submit}
          </button>
        </div>
      </div>
    </form>
  )
}
