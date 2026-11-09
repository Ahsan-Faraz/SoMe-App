'use client'

import Link from 'next/link'
import { useState, useTransition, type FormEvent } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { createCommunityAction, setCommunityAdminAction } from '../actions'
import { HEADLINE_MAX, NAME_MAX, type PlatformCommunity } from '../types'

const field = 'h-11 w-full min-w-0 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] text-ink outline-none focus:border-accent'

// The platform admin's screen (client feedback 261102): create a community, and appoint or remove
// each community's admins. Only the platform admin does either (D9 note, §3).
export function PlatformCommunities({ communities }: { communities: PlatformCommunity[] }) {
  return (
    <main className="mx-auto grid w-full max-w-xl grid-cols-1 gap-8 px-4 py-6 sm:px-8">
      <CreateCommunity />
      <section className="grid gap-3">
        <h2 className="text-[13px] font-bold tracking-wide text-muted uppercase">{t.platform.communities}</h2>
        {communities.length ? (
          <ul className="grid gap-3">
            {communities.map((community) => (
              <CommunityRow key={community.id} community={community} />
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted">{t.platform.none}</p>
        )}
      </section>
    </main>
  )
}

function CreateCommunity() {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [headline, setHeadline] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await createCommunityAction(slug, name, headline)
      if (result) {
        setError(result.error)
        return
      }
      setSlug('')
      setName('')
      setHeadline('')
    })
  }

  return (
    <form onSubmit={create} className="grid gap-3 rounded-2xl bg-sunken p-4">
      <h2 className="text-[17px] font-bold">{t.platform.create}</h2>
      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.platform.address}
        <span className="font-normal text-ink-soft">{t.platform.addressHint}</span>
        <input value={slug} required onChange={(event) => setSlug(event.target.value)} autoCapitalize="none" spellCheck={false} className={field} />
      </label>
      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.platform.name}
        <input value={name} required maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} className={field} />
      </label>
      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.platform.headline}
        <input value={headline} maxLength={HEADLINE_MAX} onChange={(event) => setHeadline(event.target.value)} className={field} />
      </label>
      {error ? (
        <p role="alert" className="text-[15px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${buttonClass('primary')} disabled:opacity-50`}>
        {pending ? t.platform.creating : t.platform.createButton}
      </button>
    </form>
  )
}

// One community: its address, members, admins (each removable), and "Make admin" by username.
function CommunityRow({ community }: { community: PlatformCommunity }) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const setAdmin = (name: string, admin: boolean) => {
    setError('')
    startTransition(async () => {
      const result = await setCommunityAdminAction(community.id, name, admin)
      if (result) setError(result.error)
      else if (admin) setUsername('')
    })
  }

  return (
    <li className="grid gap-3 rounded-2xl border border-line p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/${community.slug}`} className="min-w-0 truncate text-[17px] font-bold hover:underline">
          {community.name}
        </Link>
        <span className="shrink-0 text-[14px] text-muted">{t.platform.members(community.members)}</span>
      </div>
      <p className="-mt-2 text-[14px] text-ink-soft">/{community.slug}</p>
      <div className="grid gap-1.5">
        <h3 className="text-[14px] font-semibold">{t.platform.admins}</h3>
        {community.admins.length ? (
          <ul className="flex flex-wrap gap-2">
            {community.admins.map((admin) => (
              <li key={admin} className="flex items-center gap-1 rounded-full bg-rail py-1 pr-1 pl-3 text-[15px]">
                {admin}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setAdmin(admin, false)}
                  aria-label={t.platform.removeAdmin(admin)}
                  className="grid size-7 place-items-center rounded-full text-muted hover:bg-soft-hover hover:text-danger disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">{t.platform.noAdmin}</p>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setAdmin(username, true)
        }}
        className="flex gap-2"
      >
        <input
          value={username}
          required
          onChange={(event) => setUsername(event.target.value)}
          placeholder={t.platform.username}
          aria-label={t.platform.username}
          autoCapitalize="none"
          className={field}
        />
        <button type="submit" disabled={pending} className="h-11 shrink-0 rounded-xl bg-rail px-4 text-[15px] font-semibold text-ink hover:bg-soft-hover disabled:opacity-50">
          {t.platform.makeAdmin}
        </button>
      </form>
      {error ? (
        <p role="alert" className="text-[15px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </li>
  )
}
