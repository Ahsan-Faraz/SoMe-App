'use client'

import Link from 'next/link'
import { useState, useTransition, type FormEvent } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { GrowingTextarea } from '@/components/ui/GrowingTextarea'
import { t } from '@/lib/i18n'
import { saveCommunitySettingsAction, type CommunitySettings } from '../actions'

const field = 'w-full min-w-0 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] text-ink outline-none focus:border-accent'

// The community admin's settings (client feedback 261102): what an application asks for, its
// instructions, and direct join. Which profile fields are required is set in the profile builder.
export function CommunitySettingsForm({ community, initial }: { community: string; initial: CommunitySettings }) {
  const [settings, setSettings] = useState(initial)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const set = (change: Partial<CommunitySettings>) => {
    setMessage(null)
    setSettings((current) => ({ ...current, ...change }))
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveCommunitySettingsAction(community, settings)
      setMessage(result ? { error: true, text: result.error } : { error: false, text: t.settings.saved })
    })
  }

  const toggles: { key: 'directJoin' | 'image' | 'text' | 'names'; label: string; hint?: string; off?: boolean }[] = [
    { key: 'directJoin', label: t.settings.directJoin, hint: t.settings.directJoinHint },
    { key: 'image', label: t.settings.image, hint: settings.directJoin ? t.settings.noImages : undefined, off: settings.directJoin },
    { key: 'text', label: t.settings.text },
    { key: 'names', label: t.settings.names },
  ]

  return (
    <form onSubmit={save} className="mx-auto grid max-w-xl grid-cols-1 gap-6 px-4 py-6 sm:px-8">
      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.settings.instructions}
        <span className="font-normal text-ink-soft">{t.settings.instructionsHint}</span>
        <GrowingTextarea
          value={settings.applicationText}
          maxLength={4000}
          rows={4}
          onChange={(event) => set({ applicationText: event.target.value })}
          className={`${field} min-h-28 py-2.5 leading-normal`}
        />
      </label>

      <fieldset className="grid gap-3 rounded-2xl bg-sunken p-4">
        <legend className="mb-1 text-[13px] font-bold tracking-wide text-muted uppercase">{t.settings.application}</legend>
        {toggles.map((toggle) => (
          <label key={toggle.key} className={`flex items-start gap-3 text-[16px] ${toggle.off ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              checked={settings[toggle.key]}
              disabled={toggle.off}
              onChange={(event) => set({ [toggle.key]: event.target.checked })}
              className="mt-1"
            />
            <span>
              {toggle.label}
              {toggle.hint ? <span className="block text-[14px] text-ink-soft">{toggle.hint}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>

      <Link href={`/${community}/admin/fields`} className={buttonClass('secondary')}>
        {t.settings.requiredFields}
      </Link>

      {message ? (
        <p role={message.error ? 'alert' : 'status'} className={`text-[15px] font-semibold ${message.error ? 'text-danger' : 'text-ink-soft'}`}>
          {message.text}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${buttonClass('primary')} disabled:opacity-50`}>
        {pending ? t.settings.saving : t.settings.save}
      </button>
    </form>
  )
}
