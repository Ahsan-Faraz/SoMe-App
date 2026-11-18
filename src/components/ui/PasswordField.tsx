'use client'

import { useState, type InputHTMLAttributes } from 'react'
import { t } from '@/lib/i18n'
import { Icon } from './Icon'

// A password input with a show/hide button, and an optional hint under it (the rule for a new
// password). The same look as TextField.
export function PasswordField({ label, id, hint, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; id: string; hint?: string }) {
  const [shown, setShown] = useState(false)
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          aria-describedby={hintId}
          // Never corrected or capitalised while it is shown as text.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-12 w-full rounded-xl border border-line-strong bg-canvas pr-12 pl-4 text-[16px] text-ink outline-none transition-colors placeholder:text-ink/40 hover:border-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-label={shown ? t.common.hidePassword : t.common.showPassword}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-xl text-muted hover:text-ink"
        >
          <Icon name={shown ? 'eyeOff' : 'eye'} className="size-5" />
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
