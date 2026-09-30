import type { ReactNode } from 'react'

// One phone screen: header, a middle area that scrolls, and an optional bottom bar that always
// sits at the bottom of the screen. Only the middle scrolls, so iOS never moves the bars
// (a page-level scroll with position:fixed/sticky bars breaks in the iPhone home-screen app).
export const scrollArea = 'min-h-0 flex-1 overflow-y-auto overscroll-contain'
export const bottomBar = 'shrink-0 border-t border-line bg-canvas px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'

export function Screen({ header, footer, children }: { header: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      {header}
      <main className={scrollArea}>{children}</main>
      {footer}
    </div>
  )
}
