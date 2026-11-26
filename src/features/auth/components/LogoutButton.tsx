'use client'

import { useTransition } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { signOutAction } from '../actions'

// to: where the full page load goes after logging out (default: the community's start page).
export function LogoutButton({ community, className, withLabel = false, to }: { community: string; className: string; withLabel?: boolean; to?: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await signOutAction()
          // A full page load: the pages kept alive in the browser (yours) are dropped.
          window.location.replace(to ?? `/${community}`)
        })
      }
      disabled={pending}
      aria-label={withLabel ? undefined : t.common.logout}
      className={className}
    >
      <Icon name="logout" className="size-5 shrink-0" />
      {withLabel ? <span>{t.common.logout}</span> : null}
    </button>
  )
}
