import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScreenHeader } from '@/components/ui/ScreenHeader'

// The frame of the main domain's own pages (/login, /join, /communities): no community, so no
// community picture beside the form. Back goes to the domain's front page.
export function SiteShell({ title, heading, right, children }: { title: string; heading: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader
        title={title}
        backHref="/"
        right={right ?? <ThemeToggle className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover" />}
      />
      <main className="mx-auto w-full max-w-md px-5 pt-8 pb-12">
        <h2 className="mb-6 text-[28px] leading-tight font-bold">{heading}</h2>
        {children}
      </main>
    </div>
  )
}
