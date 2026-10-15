'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import type { Album } from '@/features/albums/types'
import type { MainPhoto } from '@/features/profiles/types'
import { formatDay } from '@/lib/format'
import { useGoBack } from '@/lib/history'
import { t } from '@/lib/i18n'
import { imageDataUrl } from '@/lib/image'
import { loadAds, saveAds } from '../storage'
import type { Ad } from '../types'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })
const AlbumPhotos = dynamic(() => import('@/features/albums/components/AlbumPhotos').then((mod) => mod.AlbumPhotos), { ssr: false })
const input = 'h-11 w-full rounded-xl border border-line bg-canvas px-3 text-[16px] font-normal outline-none focus:border-accent'

export function AdEditor({
  community,
  seed,
  adId,
  own,
  profileHref,
  chatHref,
  author,
  albums = [],
  profilePhoto = null,
  statuses,
  districts,
}: {
  community: string
  seed: Ad[]
  adId: string | null
  own: boolean
  profileHref: string | null
  chatHref: string | null
  author: { userId: string; username: string; status: string; age: number }
  // Own ads only: the sources for "From profile/album".
  albums?: Album[]
  profilePhoto?: MainPhoto | null
  // The community's active lists (profile builder).
  statuses: readonly string[]
  districts: readonly string[]
}) {
  const goBack = useGoBack(community)
  const seeded = adId ? (seed.find((item) => item.id === adId) ?? null) : null
  const [ad, setAd] = useState<Ad | null>(seeded)
  // Render the known ad straight away (first paint from the server); only wait when it may exist on this device only.
  const [ready, setReady] = useState(!adId || seeded !== null)
  const [camera, setCamera] = useState(false)
  const [picking, setPicking] = useState(false)
  const [headline, setHeadline] = useState(seeded?.headline ?? '')
  const [body, setBody] = useState(seeded?.body ?? '')
  const [lookingFor, setLookingFor] = useState<string[]>(seeded?.lookingFor ?? [])
  const [district, setDistrict] = useState<string>(seeded?.district ?? districts[0] ?? '')
  const [place, setPlace] = useState(seeded?.place ?? '')
  const [image, setImage] = useState(seeded?.image ?? '')
  const [verified, setVerified] = useState(seeded?.verified ?? false)
  const [error, setError] = useState('')

  useEffect(() => {
    const found = adId ? (loadAds(community, seed).find((item) => item.id === adId) ?? null) : null
    setReady(true)
    if (!found) return setAd(null)
    setAd(found)
    setHeadline(found.headline)
    setBody(found.body)
    setLookingFor(found.lookingFor)
    setDistrict(found.district)
    setPlace(found.place)
    setImage(found.image)
    setVerified(found.verified)
  }, [community, seed, adId])

  if (!ready) return null
  if (adId && !ad) return <p className="px-5 py-10 text-muted">{t.ads.empty}</p>
  if (camera) {
    return (
      <CameraCapture
        onClose={() => setCamera(false)}
        onCapture={(src) => {
          setImage(src)
          setVerified(true)
          setCamera(false)
        }}
      />
    )
  }

  const locked = !own
  const shown = ad ?? {
    status: author.status,
    age: author.age,
    published: formatDay(),
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        if (locked || !headline.trim()) return
        if (lookingFor.length === 0) return setError(t.ads.lookingForMissing)
        const ads = loadAds(community, seed)
        const next: Ad = {
          id: ad?.id ?? `ad-${Date.now()}`,
          userId: ad?.userId ?? author.userId,
          username: ad?.username ?? author.username,
          status: ad?.status ?? author.status,
          age: ad?.age ?? author.age,
          district,
          place: place.trim(),
          headline: headline.trim(),
          body: body.trim(),
          published: ad?.published ?? shown.published,
          lookingFor,
          image,
          verified,
        }
        saveAds(community, ad ? ads.map((item) => (item.id === ad.id ? next : item)) : [next, ...ads])
        goBack(own && ad ? `/${community}/profiles/${author.userId}/ads` : `/${community}/ads`)
      }}
    >
      <div className={scrollArea}>
        <div className="mx-auto grid max-w-lg gap-4 px-4 py-6 sm:px-8">
          {locked ? (
            // Someone else's ad: plain text, no form controls (no drop-down arrows on fields you can't change).
            <dl className="grid gap-4">
              <Fact label={t.ads.lookingFor} value={lookingFor.join(', ')} />
              <Fact label={t.profiles.headline} value={headline} />
              <Fact label={t.ads.text} value={body} />
              <Fact label={t.profiles.district} value={district} />
              <Fact label={t.profiles.place} value={place} />
            </dl>
          ) : (
            <>
              <MultiSelect
                label={t.ads.lookingFor}
                options={statuses}
                value={lookingFor}
                onChange={(value) => {
                  setLookingFor(value)
                  setError('')
                }}
                placeholder={t.profiles.choose}
              />
              <label className="grid gap-1.5 text-[14px] font-semibold">
                {t.profiles.headline}
                <input required value={headline} onChange={(event) => setHeadline(event.target.value)} className={input} />
              </label>
              <label className="grid gap-1.5 text-[14px] font-semibold">
                {t.ads.text}
                <textarea
                  required
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={5}
                  className="rounded-xl border border-line px-3 py-2 text-[16px] font-normal outline-none focus:border-accent"
                />
              </label>
              <label className="grid gap-1.5 text-[14px] font-semibold">
                {t.profiles.district}
                <select value={district} onChange={(event) => setDistrict(event.target.value)} className={input}>
                  {districts.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-[14px] font-semibold">
                {t.profiles.place}
                <input value={place} onChange={(event) => setPlace(event.target.value)} className={input} />
              </label>
            </>
          )}
          <div>
            <p className="text-[14px] font-semibold">{t.ads.image}</p>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="mt-2 aspect-video w-full rounded-2xl object-cover" />
            ) : null}
            {verified ? <p className="mt-1 text-[13px] font-semibold text-accent">✓ {t.chats.takenInApp}</p> : null}
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
                      setImage(await imageDataUrl(file, 1600))
                      setVerified(false)
                    }}
                  />
                </label>
                <button type="button" onClick={() => setPicking(true)} className="grid min-h-14 place-items-center rounded-xl bg-soft px-2 text-center text-[15px] leading-tight font-semibold hover:bg-soft-hover">
                  {t.chats.fromAlbum}
                </button>
              </div>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-sunken p-4 text-[15px]">
            <div>
              <dt className="text-muted">{t.profiles.age}</dt>
              <dd className="font-semibold">{shown.age}</dd>
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
              <button type="submit" className={buttonClass('primary')}>
                {t.ads.publishAction}
              </button>
              {ad ? (
                <button
                  type="button"
                  className={buttonClass('secondary')}
                  onClick={() => {
                    saveAds(
                      community,
                      loadAds(community, seed).filter((item) => item.id !== ad.id),
                    )
                    goBack(`/${community}/ads`)
                  }}
                >
                  {t.ads.delete}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {profileHref ? (
                <Link href={profileHref} className={buttonClass('secondary')}>
                  {t.ads.profile}
                </Link>
              ) : null}
              {chatHref ? (
                <Link href={chatHref} className={buttonClass('primary')}>
                  {t.profiles.dm}
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {picking ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={t.chats.fromAlbum} onClick={() => setPicking(false)}>
          <div className="max-h-[80dvh] w-full overflow-y-auto rounded-t-3xl bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl lg:h-full lg:max-h-none lg:max-w-md lg:rounded-none" onClick={(event) => event.stopPropagation()}>
            <p className="px-5 pt-4 text-[17px] font-bold">{t.chats.fromAlbum}</p>
            <AlbumPhotos
              community={community}
              viewerId={author.userId}
              albums={albums}
              profilePhoto={profilePhoto}
              onPick={(photo) => {
                setImage(photo.src)
                setVerified(photo.verified)
                setPicking(false)
              }}
            />
            <div className="px-4">
              <button type="button" onClick={() => setPicking(false)} className={buttonClass('secondary')}>
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
