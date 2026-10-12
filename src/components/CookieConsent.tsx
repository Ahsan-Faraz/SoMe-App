'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'

// Cookie consent, asked once per browser. Today the app only uses what it needs to work (the login
// cookie, and settings such as theme and filters on this device), so both choices behave the same.
// Anything optional added later (e.g. statistics) must check cookieChoice() === 'all' first.

const KEY = 'some:cookie-consent'
const EVENT = 'some-cookie-consent'

export type CookieChoice = 'necessary' | 'all'

export function cookieChoice(): CookieChoice | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { choice?: unknown } | null
    return saved?.choice === 'all' || saved?.choice === 'necessary' ? saved.choice : null
  } catch {
    return null
  }
}

function saveChoice(choice: CookieChoice | null) {
  try {
    if (choice) localStorage.setItem(KEY, JSON.stringify({ choice, at: new Date().toISOString() }))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: ask again next time.
  }
  window.dispatchEvent(new Event(EVENT))
}

export function CookieConsent() {
  const [open, setOpen] = useState(false)
  const [community, setCommunity] = useState('')

  useEffect(() => {
    // The root layout has no route params: the community is the first part of the path.
    setCommunity(location.pathname.split('/')[1] ?? '')
    const read = () => setOpen(cookieChoice() === null)
    read()
    window.addEventListener(EVENT, read)
    return () => window.removeEventListener(EVENT, read)
  }, [])

  if (!open) return null

  return (
    <div role="dialog" aria-label={t.cookies.title} className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-canvas p-4 shadow-2xl shadow-black/20 sm:p-5">
        <h2 className="text-[16px] font-bold">{t.cookies.title}</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
          {t.cookies.body}{' '}
          {community ? (
            <Link href={`/${community}/privacy`} className="font-semibold text-accent underline">
              {t.cookies.privacy}
            </Link>
          ) : null}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => saveChoice('necessary')} className="h-11 rounded-xl bg-rail px-3 text-[15px] font-semibold text-ink hover:bg-soft-hover">
            {t.cookies.necessary}
          </button>
          <button type="button" onClick={() => saveChoice('all')} className="h-11 rounded-xl bg-accent px-3 text-[15px] font-semibold text-white hover:bg-accent-hover">
            {t.cookies.all}
          </button>
        </div>
      </div>
    </div>
  )
}

// On the privacy page: forget the choice, so the banner asks again.
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => saveChoice(null)} className={className}>
      {t.cookies.change}
    </button>
  )
}
