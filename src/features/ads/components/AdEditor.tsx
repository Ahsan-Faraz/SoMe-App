'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import { t } from '@/lib/i18n'
import { imageDataUrl } from '@/lib/image'
import { loadAds, saveAds } from '../storage'
import type { Ad } from '../types'

const CameraCapture = dynamic(() => import('@/components/camera/CameraCapture').then((mod) => mod.CameraCapture), { ssr: false })

const looking = ['Man', 'Woman', 'Couple', 'Other']
const districts = ['Stockholm', 'Södermalm', 'Nacka', 'Solna', 'Årsta']
const input = 'h-11 w-full rounded-xl border border-line bg-canvas px-3 text-[16px] font-normal outline-none focus:border-accent disabled:bg-sunken'

export function AdEditor({
  community,
  seed,
  adId,
  own,
  profileHref,
  chatHref,
  author,
}: {
  community: string
  seed: Ad[]
  adId: string | null
  own: boolean
  profileHref: string | null
  chatHref: string | null
  author: { userId: string; username: string; status: string; age: number }
}) {
  const router = useRouter()
  const seeded = adId ? (seed.find((item) => item.id === adId) ?? null) : null
  const [ad, setAd] = useState<Ad | null>(seeded)
  // Render the known ad straight away (first paint from the server); only wait when it may exist on this device only.
  const [ready, setReady] = useState(!adId || seeded !== null)
  const [camera, setCamera] = useState(false)
  const [headline, setHeadline] = useState(seeded?.headline ?? '')
  const [body, setBody] = useState(seeded?.body ?? '')
  const [lookingFor, setLookingFor] = useState(seeded?.lookingFor ?? 'Man')
  const [district, setDistrict] = useState(seeded?.district ?? districts[0] ?? '')
  const [place, setPlace] = useState(seeded?.place ?? '')
  const [image, setImage] = useState(seeded?.image ?? '')
  const [verified, setVerified] = useState(seeded?.verified ?? false)

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
    published: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()),
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        if (locked || !headline.trim()) return
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
        router.push(own && ad ? `/${community}/profiles/${author.userId}/ads` : `/${community}/ads`)
      }}
    >
      <div className={scrollArea}>
        <div className="mx-auto grid max-w-lg gap-4 px-4 py-6 sm:px-8">
          <label className="grid gap-1.5 text-[14px] font-semibold">
            {t.ads.lookingFor}
            <select disabled={locked} value={lookingFor} onChange={(event) => setLookingFor(event.target.value)} className={input}>
              {looking.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-[14px] font-semibold">
            {t.profiles.headline}
            <input disabled={locked} required value={headline} onChange={(event) => setHeadline(event.target.value)} className={input} />
          </label>
          <label className="grid gap-1.5 text-[14px] font-semibold">
            {t.ads.text}
            <textarea
              disabled={locked}
              required
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              className="rounded-xl border border-line px-3 py-2 text-[16px] font-normal outline-none focus:border-accent disabled:bg-sunken"
            />
          </label>
          <label className="grid gap-1.5 text-[14px] font-semibold">
            {t.profiles.district}
            <select disabled={locked} value={district} onChange={(event) => setDistrict(event.target.value)} className={input}>
              {districts.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-[14px] font-semibold">
            {t.profiles.place}
            <input disabled={locked} value={place} onChange={(event) => setPlace(event.target.value)} className={input} />
          </label>
          <div>
            <p className="text-[14px] font-semibold">{t.ads.image}</p>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="mt-2 aspect-video w-full rounded-2xl object-cover" />
            ) : null}
            {verified ? <p className="mt-1 text-[13px] font-semibold text-accent">✓ {t.chats.verified}</p> : null}
            {own ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCamera(true)} className="grid min-h-14 content-center rounded-xl bg-accent px-3 py-2 text-center text-white">
                  <span className="text-[15px] font-semibold">{t.chats.camera}</span>
                  <span className="text-[12px] text-white/85">{t.chats.cameraTag}</span>
                </button>
                <label className="grid min-h-14 cursor-pointer place-items-center rounded-xl bg-soft px-3 text-[15px] font-semibold">
                  {t.chats.upload}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      setImage(await imageDataUrl(file, 1600))
                      setVerified(false)
                    }}
                  />
                </label>
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
                    router.push(`/${community}/ads`)
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
    </form>
  )
}
