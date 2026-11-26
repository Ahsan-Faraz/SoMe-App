'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { GrowingTextarea } from '@/components/ui/GrowingTextarea'
import { t } from '@/lib/i18n'
import { START_ABOUT_MAX, START_SUBTITLE_MAX, START_TITLE_MAX } from '@/lib/limits'
import { saveCommunityStartAction } from '../actions'
import { uploadStartImage } from '../upload'

const field = 'w-full min-w-0 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] text-ink outline-none focus:border-accent'

export type StartPageInitial = { title: string; headline: string; about: string; listed: boolean; heroSrc: string; heroUploaded: boolean }

// What happens to the image on Save: kept, a new file (uploaded on Save), or the built-in picture.
type ImageChoice = { kind: 'keep' } | { kind: 'new'; file: File; preview: string } | { kind: 'default' }

// The community start page (/{community}, client guide 261123), on the community settings screen:
// headline, subheadline, image and info text. The image goes to Storage only on Save, so picking
// and changing your mind leaves no files behind.
export function CommunityStartForm({ community, communityId, initial }: { community: string; communityId: string; initial: StartPageInitial }) {
  const [texts, setTexts] = useState({ title: initial.title, headline: initial.headline, about: initial.about, listed: initial.listed })
  const [image, setImage] = useState<ImageChoice>({ kind: 'keep' })
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const preview = image.kind === 'new' ? image.preview : image.kind === 'default' ? null : initial.heroUploaded ? initial.heroSrc : null
  const newPreview = image.kind === 'new' ? image.preview : null
  useEffect(() => (newPreview ? () => URL.revokeObjectURL(newPreview) : undefined), [newPreview])

  const setText = (change: Partial<typeof texts>) => {
    setMessage(null)
    setTexts((current) => ({ ...current, ...change }))
  }
  const choose = (choice: ImageChoice) => {
    setMessage(null)
    setImage(choice)
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      let path: string | null | undefined
      if (image.kind === 'new') {
        try {
          path = await uploadStartImage(communityId, image.file)
        } catch {
          setMessage({ error: true, text: t.settings.startImageFailed })
          return
        }
      } else if (image.kind === 'default') {
        path = null
      }
      const result = await saveCommunityStartAction(community, { ...texts, ...(path === undefined ? {} : { image: path }) })
      if (result) {
        setMessage({ error: true, text: result.error })
        return
      }
      setImage({ kind: 'keep' })
      setMessage({ error: false, text: t.settings.saved })
    })
  }

  return (
    <form onSubmit={save} className="mx-auto grid max-w-xl grid-cols-1 gap-5 px-4 pt-6 sm:px-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-bold tracking-wide text-muted uppercase">{t.settings.startPage}</h2>
        <Link href={`/${community}`} target="_blank" className="text-[14px] font-semibold text-accent hover:underline">
          {t.settings.startView}
        </Link>
      </div>

      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.settings.startTitle}
        <span className="font-normal text-ink-soft">{t.settings.startTitleHint}</span>
        <input value={texts.title} maxLength={START_TITLE_MAX} onChange={(event) => setText({ title: event.target.value })} className={`${field} h-12`} />
      </label>

      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.settings.startSubtitle}
        <input value={texts.headline} maxLength={START_SUBTITLE_MAX} onChange={(event) => setText({ headline: event.target.value })} className={`${field} h-12`} />
      </label>

      <div className="grid gap-1.5">
        <p className="text-[14px] font-semibold">{t.settings.startImage}</p>
        {preview ? (
          // A file just picked (a local preview) or the admin's image in the public bucket.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="aspect-video w-full rounded-2xl object-cover" />
        ) : (
          <p className="rounded-2xl bg-sunken p-4 text-[14px] text-ink-soft">{t.settings.startImageDefault}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className={`${buttonClass('secondary')} cursor-pointer focus-within:outline-2 focus-within:outline-accent`}>
            {t.settings.startImagePick}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) choose({ kind: 'new', file, preview: URL.createObjectURL(file) })
              }}
            />
          </label>
          <button
            type="button"
            disabled={!preview}
            onClick={() => choose({ kind: initial.heroUploaded ? 'default' : 'keep' })}
            className={`${buttonClass('ghost')} disabled:opacity-50`}
          >
            {t.settings.startImageReset}
          </button>
        </div>
      </div>

      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.settings.startAbout}
        <span className="font-normal text-ink-soft">{t.settings.startAboutHint}</span>
        <GrowingTextarea
          value={texts.about}
          maxLength={START_ABOUT_MAX + 200}
          rows={6}
          onChange={(event) => setText({ about: event.target.value })}
          className={`${field} min-h-36 py-2.5 leading-normal`}
        />
      </label>

      <label className="flex items-start gap-3 rounded-2xl bg-sunken p-4 text-[16px]">
        <input type="checkbox" checked={texts.listed} onChange={(event) => setText({ listed: event.target.checked })} className="mt-1" />
        <span>
          {t.settings.startListed}
          <span className="block text-[14px] text-ink-soft">{t.settings.startListedHint}</span>
        </span>
      </label>

      {message ? (
        <p role={message.error ? 'alert' : 'status'} className={`text-[15px] font-semibold ${message.error ? 'text-danger' : 'text-ink-soft'}`}>
          {message.text}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${buttonClass('primary')} disabled:opacity-50`}>
        {pending ? t.settings.saving : t.settings.startSave}
      </button>
    </form>
  )
}
