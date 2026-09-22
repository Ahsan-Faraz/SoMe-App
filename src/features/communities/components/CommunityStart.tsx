import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { Community } from '../types'

function PicturePlaceholder({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`grid aspect-[16/9] place-items-center rounded-2xl bg-gradient-to-br from-accent to-sky-400 text-5xl font-bold text-white/90 ${className}`}
    >
      {label.slice(0, 1)}
    </div>
  )
}

export function CommunityStart({ community }: { community: Community }) {
  const [firstParagraph, ...rest] = community.about

  return (
    <main className="mx-auto max-w-md px-6 pb-12 pt-10">
      <h1 className="text-center text-3xl font-bold tracking-tight">{community.name}</h1>
      <p className="mt-2 text-center text-neutral-600">{community.headline}</p>

      <PicturePlaceholder label={community.name} className="mt-6" />

      <div className="mt-6 grid gap-3">
        <Link href={`/${community.slug}/login`} className={buttonClass('primary')}>
          {t.start.login}
        </Link>
        <Link href={`/${community.slug}/join`} className={buttonClass('secondary')}>
          {t.start.join}
        </Link>
      </div>

      <section className="mt-10 space-y-4 leading-relaxed text-neutral-700">
        {firstParagraph ? <p>{firstParagraph}</p> : null}
        <PicturePlaceholder label={community.name} />
        {rest.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>
    </main>
  )
}
