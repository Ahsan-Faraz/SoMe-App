import type { ReactNode } from 'react'
import { BackLink } from './BackLink'

// backHref = the screen's parent, used only when there is no previous screen to go back to.
export function ScreenHeader({ title, backHref, leading, right }: { title: ReactNode; backHref?: string; leading?: ReactNode; right?: ReactNode }) {
  return (
    <header
      className={`sticky top-0 z-10 grid h-14 shrink-0 items-center border-b border-line bg-canvas px-2 ${leading ? 'grid-cols-[6rem_minmax(0,1fr)_6rem]' : 'grid-cols-[3rem_minmax(0,1fr)_auto]'}`}
    >
      <div className="flex items-center">
        {backHref ? <BackLink fallback={backHref} /> : null}
        {leading}
      </div>
      <h1 className="truncate text-center text-[17px] font-bold">{title}</h1>
      <div className="flex min-w-12 justify-end">{right}</div>
    </header>
  )
}
