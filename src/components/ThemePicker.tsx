'use client'

import { useSyncExternalStore } from 'react'
import { t } from '@/lib/i18n'
import { applyTheme, readTheme, subscribeTheme, type ThemeChoice } from '@/lib/theme'

const choices: ThemeChoice[] = ['system', 'light', 'dark']
export function ThemePicker({ className = '' }: { className?: string }) {
  const current = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as const)

  return (
    <fieldset className={className}>
      <legend className="mb-2 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{t.theme.title}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-rail p-1">
        {choices.map((choice) => (
          <label
            key={choice}
            className={`flex h-10 cursor-pointer items-center justify-center rounded-lg text-[15px] font-semibold has-focus-visible:outline-2 has-focus-visible:outline-accent ${
              current === choice ? 'bg-canvas text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            <input
              type="radio"
              name="theme"
              value={choice}
              checked={current === choice}
              onChange={() => applyTheme(choice)}
              className="sr-only"
            />
            {t.theme[choice]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
