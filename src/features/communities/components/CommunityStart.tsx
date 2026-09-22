import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { Community } from '../types'

function PicturePlaceholder({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`grid aspect-[16/9] place-items-center rounded-2xl bg-gradient-to-br from-accent to-sky-400 text-5xl font-bold text-white/90 sm:text-6xl ${className}`}
    >
      {label.slice(0, 1)}
    </div>
  )
}

export function CommunityStart({ community }: { community: Community }) {
  const [firstParagraph, ...rest] = community.about

  return (
    <main className="mx-auto w-full max-w-5xl px-5 pt-8 pb-16 sm:px-8 lg:px-10 lg:pt-16">
      <section className="flex flex-col lg:grid lg:grid-cols-2 lg:items-center lg:gap-x-16 lg:gap-y-6">
        <div className="lg:col-start-2 lg:row-start-1 lg:self-end">
          <h1 className="text-center text-3xl font-bold tracking-tight sm:text-4xl lg:text-left lg:text-5xl">
            {community.name}
          </h1>
          <p className="mt-2 text-center text-neutral-600 sm:text-lg lg:text-left">{community.headline}</p>
        </div>
        <PicturePlaceholder
          label={community.name}
          className="mt-6 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-center"
        />
        <div className="mx-auto mt-6 grid w-full max-w-sm gap-3 lg:col-start-2 lg:row-start-2 lg:mx-0 lg:mt-0 lg:self-start">
          <Link href={`/${community.slug}/login`} className={buttonClass('primary')}>
            {t.start.login}
          </Link>
          <Link href={`/${community.slug}/join`} className={buttonClass('secondary')}>
            {t.start.join}
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-3xl space-y-6 text-base leading-relaxed text-neutral-700 sm:text-lg lg:mt-20">
        {firstParagraph ? <p>{firstParagraph}</p> : null}
        <PicturePlaceholder label={community.name} />
        {rest.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>
    </main>
  )
}
