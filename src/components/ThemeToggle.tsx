'use client'

import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { applyTheme, isDark } from '@/lib/theme'

// One tap flips light ↔ dark. The icon swaps through the `dark:` variant, so the
// server HTML is already right before hydration (no state, no mismatch).
export function ThemeToggle({ className, withLabel = false }: { className: string; withLabel?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => applyTheme(isDark() ? 'light' : 'dark')}
      aria-label={withLabel ? undefined : t.theme.toggle}
      title={t.theme.toggle}
      className={className}
    >
      <Icon name="moon" className="size-5 shrink-0 dark:hidden" />
      <Icon name="sun" className="hidden size-5 shrink-0 dark:block" />
      {withLabel ? (
        <>
          <span className="dark:hidden">{t.theme.toDark}</span>
          <span className="hidden dark:inline">{t.theme.toLight}</span>
        </>
      ) : null}
    </button>
  )
}
