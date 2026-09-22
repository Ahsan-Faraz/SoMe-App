import Link from 'next/link'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { Icon } from './Icon'

export function ScreenHeader({ title, backHref, right }: { title: string; backHref?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 grid h-14 grid-cols-[3rem_1fr_3rem] items-center border-b border-neutral-200 bg-white/95 px-2 backdrop-blur">
      <div>
        {backHref ? (
          <Link
            href={backHref}
            aria-label={t.common.back}
            className="inline-flex size-11 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
          >
            <Icon name="chevronLeft" />
          </Link>
        ) : null}
      </div>
      <h1 className="truncate text-center text-lg font-semibold">{title}</h1>
      <div className="flex justify-end">{right}</div>
    </header>
  )
}
