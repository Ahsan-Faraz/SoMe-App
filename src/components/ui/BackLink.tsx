'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { goUp } from '@/lib/history'
import { t } from '@/lib/i18n'
import { Icon } from './Icon'

// The header's back arrow. It goes to the screen's parent (`fallback`): one logical level up, not
// the browser's previous page (lib/history.ts).
export function BackLink({ fallback }: { fallback: string }) {
  const router = useRouter()

  return (
    <Link
      href={fallback}
      aria-label={t.common.back}
      onClick={(event) => {
        // Let cmd/ctrl-click open the parent in a new tab.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        goUp(router, fallback)
      }}
      className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover"
    >
      <Icon name="chevronLeft" className="size-7" />
    </Link>
  )
}
