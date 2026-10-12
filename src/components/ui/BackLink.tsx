'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { canGoBack } from '@/lib/history'
import { t } from '@/lib/i18n'
import { Icon } from './Icon'

// The header's back arrow. It goes back to the previous screen, like the browser's Back.
// `fallback` (the screen's parent) is only used when the screen was opened directly.
export function BackLink({ fallback }: { fallback: string }) {
  const router = useRouter()
  const community = fallback.split('/')[1] ?? ''

  return (
    <Link
      href={fallback}
      aria-label={t.common.back}
      onClick={(event) => {
        // Let cmd/ctrl-click open the parent in a new tab.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        if (!canGoBack(community)) return
        event.preventDefault()
        router.back()
      }}
      className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover"
    >
      <Icon name="chevronLeft" className="size-7" />
    </Link>
  )
}
