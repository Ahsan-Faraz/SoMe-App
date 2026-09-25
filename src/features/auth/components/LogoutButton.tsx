'use client'

import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import { signOut } from '../browser'

export function LogoutButton({ community, className, withLabel = false }: { community: string; className: string; withLabel?: boolean }) {
  const router = useRouter()

  function onClick() {
    signOut()
    router.replace(`/${community}`)
    router.refresh()
  }

  return (
    <button type="button" onClick={onClick} aria-label={withLabel ? undefined : t.common.logout} className={className}>
      <Icon name="logout" className="size-5 shrink-0" />
      {withLabel ? <span>{t.common.logout}</span> : null}
    </button>
  )
}
