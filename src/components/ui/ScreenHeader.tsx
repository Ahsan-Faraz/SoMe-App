import Link from 'next/link'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { Icon } from './Icon'

export function ScreenHeader({ title, backHref, right }: { title: ReactNode; backHref?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 grid h-14 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center border-b border-black/10 bg-canvas px-2">
      <div>
        {backHref ? (
          <Link
            href={backHref}
            aria-label={t.common.back}
            className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-black/5"
          >
            <Icon name="chevronLeft" className="size-7" />
          </Link>
        ) : null}
      </div>
      <h1 className="truncate text-center text-[17px] font-bold">{title}</h1>
      <div className="flex justify-end">{right}</div>
    </header>
  )
}
