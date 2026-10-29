'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import { dmHref } from '@/features/chats/links'
import type { Choice } from '@/features/fields/types'
import type { MainPhoto } from '@/features/profiles/types'
import { formatDay } from '@/lib/format'
import { useGoBack } from '@/lib/history'
import { t } from '@/lib/i18n'
import { imageDataUrl, type ResizedImage } from '@/lib/image'
import { HEADLINE_MAX, LONG_TEXT_MAX, PLACE_MAX } from '@/lib/limits'
import { deleteAdAction, saveAdAction } from '../actions'
import type { AdDetail } from '../types'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })
const AlbumPhotos = dynamic(() => import('@/features/albums/components/AlbumPhotos').then((mod) => mod.AlbumPhotos), { ssr: false })
const input = 'h-11 w-full rounded-xl border border-line bg-canvas px-3 text-[16px] font-normal outline-none focus:border-accent'

// A new image for the ad, uploaded on Publish: a camera capture (Taken in app), a picked file, or a
// profile/album photo (its signed link, fetched then). Always uploaded again as the ad's own copy.
type Picked = { source: ResizedImage | Blob | string; verified: boolean }

// D2 (your ad: publish, edit, delete) and D3 (someone else's: read, Profile, DM). ad: null for a new
// one. Age, Status and Published come from the profile (author) and are never edited here.
export function AdEditor({
  community,
  communityId,
  viewerId,
  ad,
  author,
  profilePhoto = null,
  statuses,
  districts,
}: {
  community: string
  communityId: string
  viewerId: string
  ad: AdDetail | null
  // A new ad shows your own Status and ages.
  author: { status: string; ages: number[] }
  profilePhoto?: MainPhoto | null
  // The community's active lists (profile builder).
  statuses: readonly Choice[]
  districts: readonly Choice[]
}) {
  const goBack = useGoBack(community)
  const own = !ad || ad.own
  const [camera, setCamera] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [headline, setHeadline] = useState(ad?.headline ?? '')
  const [body, setBody] = useState(ad?.body ?? '')
  const [lookingFor, setLookingFor] = useState<string[]>(ad?.lookingForIds ?? [])
  const [district, setDistrict] = useState(ad?.districtId ?? districts[0]?.id ?? '')
  const [place, setPlace] = useState(ad?.place ?? '')
  const [image, setImage] = useState<{ src: string; verified: boolean } | null>(ad?.image ? { src: ad.image, verified: ad.verified } : null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const names = Object.fromEntries([...statuses, ...districts].map((choice) => [choice.id, choice.label]))
  const back = ad?.own ? `/${community}/profiles/${viewerId}/ads` : `/${community}/ads`

  function pick(src: string, next: Picked) {
    setImage({ src, verified: next.verified })
    setPicked(next)
    setError('')
  }

  if (camera) {
    return (
      <CameraCapture
        onClose={() => setCamera(false)}
        onCapture={(src, resized) => {
          pick(src, { source: resized, verified: true })
          setCamera(false)
        }}
      />
    )
  }

  const shown = ad ?? { status: author.status, ages: author.ages, published: formatDay() }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        if (!own || pending || !headline.trim()) return
        if (lookingFor.length === 0) return setError(t.ads.lookingForMissing)
        setError('')
        startTransition(async () => {
          let photo = null
          if (picked) {
            try {
              const source = typeof picked.source === 'string' ? await (await fetch(picked.source)).blob() : picked.source
              const { uploadPhoto } = await import('@/features/profiles/upload')
              const uploaded = await uploadPhoto('private', communityId, viewerId, source, picked.verified)
              photo = { path: uploaded.path, thumb_path: uploaded.thumbPath, width: uploaded.width, height: uploaded.height, taken_in_app: uploaded.takenInApp }
            } catch {
              return setError(t.ads.imageFailed)
            }
          }
          const result = await saveAdAction(community, ad?.id ?? null, { lookingFor, headline, body, districtId: district || null, place }, photo)
          if ('error' in result) return setError(result.error)
          // The image is saved now: a retry must not upload it again.
          setPicked(null)
          goBack(back)
        })
      }}
    >
      <div className={scrollArea}>
        <div className="mx-auto grid max-w-lg gap-4 px-4 py-6 sm:px-8">
          {!own && ad ? (
            // Someone else's ad: plain text, no form controls (no drop-down arrows on fields you can't change).
            <dl className="grid gap-4">
              <Fact label={t.ads.lookingFor} value={ad.lookingFor.join(', ')} />
              <Fact label={t.profiles.headline} value={ad.headline} />
              <Fact label={t.ads.text} value={ad.body} />
              <Fact label={t.profiles.district} value={ad.district} />
              <Fact label={t.profiles.place} value={ad.place} />
            </dl>
          ) : (
            <>
              <MultiSelect
                label={t.ads.lookingFor}
                options={statuses.map((choice) => choice.id)}
                value={lookingFor}
                onChange={(value) => {
                  setLookingFor(value)
                  setError('')
                }}
                format={(id) => names[id] ?? ''}
                placeholder={t.profiles.choose}
              />
              <label className="grid gap-1.5 text-[14px] font-semibold">
                {t.profiles.headline}
                <input required maxLength={HEADLINE_MAX} value={headline} onChange={(event) => setHeadline(event.target.value)} className={input} />
              </label>
              <label className="grid gap-1.5 text-[14px] font-semibold">
                {t.ads.text}
                <textarea
                  required
                  maxLength={LONG_TEXT_MAX}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={5}
                  className="rounded-xl border border-line px-3 py-2 text-[16px] font-normal outline-none focus:border-accent"
                />
              </label>
              <label className="grid gap-1.5 text-[14px] font-semibold">
                {t.profiles.district}
                <select value={district} onChange={(event) => setDistrict(event.target.value)} className={input}>
                  {districts.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-[14px] font-semibold">
                {t.profiles.place}
                <input maxLength={PLACE_MAX} value={place} onChange={(event) => setPlace(event.target.value)} className={input} />
              </label>
            </>
          )}
          <div>
            <p className="text-[14px] font-semibold">{t.ads.image}</p>
            {image ? (
              // A signed link from the private bucket, or a new picture not uploaded yet.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.src} alt="" className="mt-2 aspect-video w-full rounded-2xl object-cover" />
            ) : null}
            {image?.verified ? <p className="mt-1 text-[13px] font-semibold text-accent">✓ {t.chats.takenInApp}</p> : null}
            {own ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setCamera(true)} className="grid min-h-14 content-center rounded-xl bg-accent px-2 py-2 text-center text-white hover:bg-accent-hover">
                  <span className="text-[15px] font-semibold">{t.chats.camera}</span>
                  <span className="text-[12px] leading-tight text-white/85">{t.chats.cameraTag}</span>
                </button>
                <label className="grid min-h-14 cursor-pointer place-items-center rounded-xl bg-soft px-2 text-center text-[15px] leading-tight font-semibold hover:bg-soft-hover focus-within:outline-2 focus-within:outline-accent">
                  {t.chats.upload}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      pick(await imageDataUrl(file, 1600), { source: file, verified: false })
                    }}
                  />
                </label>
                <button type="button" onClick={() => setChoosing(true)} className="grid min-h-14 place-items-center rounded-xl bg-soft px-2 text-center text-[15px] leading-tight font-semibold hover:bg-soft-hover">
                  {t.chats.fromAlbum}
                </button>
              </div>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-sunken p-4 text-[15px]">
            <div>
              <dt className="text-muted">{t.profiles.age}</dt>
              <dd className="font-semibold">{shown.ages.join(', ')}</dd>
            </div>
            <div>
              <dt className="text-muted">{t.profiles.status}</dt>
              <dd className="font-semibold">{shown.status}</dd>
            </div>
            <div>
              <dt className="text-muted">{t.ads.published}</dt>
              <dd className="font-semibold">{shown.published}</dd>
            </div>
          </dl>
          {error ? (
            <p role="alert" className="text-[15px] font-semibold text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <div className={bottomBar}>
        <div className="mx-auto max-w-lg">
          {own ? (
            <div className={ad ? 'grid grid-cols-2 gap-3' : undefined}>
              <button type="submit" disabled={pending} className={buttonClass('primary')}>
                {pending ? t.ads.publishing : t.ads.publishAction}
              </button>
              {ad ? (
                <button
                  type="button"
                  disabled={pending}
                  className={buttonClass('secondary')}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteAdAction(community, ad.id)
                      if (result) setError(result.error)
                      else goBack(back)
                    })
                  }
                >
                  {t.ads.delete}
                </button>
              ) : null}
            </div>
          ) : ad ? (
            <div className="grid grid-cols-2 gap-3">
              <Link href={`/${community}/profiles/${ad.userId}`} className={buttonClass('secondary')}>
                {t.ads.profile}
              </Link>
              <Link href={dmHref(community, ad.userId)} className={buttonClass('primary')}>
                {t.profiles.dm}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
      {choosing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={t.chats.fromAlbum} onClick={() => setChoosing(false)}>
          <div className="max-h-[80dvh] w-full overflow-y-auto rounded-t-3xl bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl lg:h-full lg:max-h-none lg:max-w-md lg:rounded-none" onClick={(event) => event.stopPropagation()}>
            <p className="px-5 pt-4 text-[17px] font-bold">{t.chats.fromAlbum}</p>
            <AlbumPhotos
              communityId={communityId}
              profilePhoto={profilePhoto}
              onPick={(photo) => {
                pick(photo.src, { source: photo.src, verified: photo.verified })
                setChoosing(false)
              }}
            />
            <div className="px-4">
              <button type="button" onClick={() => setChoosing(false)} className={buttonClass('secondary')}>
                {t.chats.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[14px] font-semibold text-ink">{label}</dt>
      <dd className="mt-0.5 text-[16px] whitespace-pre-wrap text-ink-soft">{value || '—'}</dd>
    </div>
  )
}
