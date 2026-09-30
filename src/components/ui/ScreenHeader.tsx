import Link from 'next/link'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { Icon } from './Icon'

export function ScreenHeader({ title, backHref, leading, right }: { title: ReactNode; backHref?: string; leading?: ReactNode; right?: ReactNode }) {
  return (
    <header
      className={`sticky top-0 z-10 grid h-14 shrink-0 items-center border-b border-line bg-canvas px-2 ${leading ? 'grid-cols-[6rem_minmax(0,1fr)_6rem]' : 'grid-cols-[3rem_minmax(0,1fr)_auto]'}`}
    >
      <div className="flex items-center">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={t.common.back}
            className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover"
          >
            <Icon name="chevronLeft" className="size-7" />
          </Link>
        ) : null}
        {leading}
      </div>
      <h1 className="truncate text-center text-[17px] font-bold">{title}</h1>
      <div className="flex min-w-12 justify-end">{right}</div>
    </header>
  )
}
