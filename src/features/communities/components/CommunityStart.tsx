import Image from 'next/image'
import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import type { Community } from '../types'

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: 'chatSolid', ...t.start.features.chats },
  { icon: 'usersSolid', ...t.start.features.profiles },
  { icon: 'camera', ...t.start.features.verified },
]

export function CommunityStart({ community }: { community: Community }) {
  const [firstParagraph, ...rest] = community.about
  const login = `/${community.slug}/login`
  const join = `/${community.slug}/join`

  return (
    <main className="min-h-dvh w-full bg-canvas px-5 pt-8 pb-16 sm:px-8 min-[52rem]:pt-0 min-[52rem]:pb-0 lg:px-16 xl:px-24">
      <header className="mx-auto hidden h-20 max-w-7xl items-center justify-between min-[52rem]:flex">
        <Link href={`/${community.slug}`} className="flex items-center gap-3">
          <Image src="/icons/logo.png" alt="" width={40} height={40} priority className="size-10" />
          <span className="text-[18px] font-bold">{community.name}</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href={login} className={`${buttonClass('ghost')} h-10! w-auto!`}>
            {t.start.login}
          </Link>
          <Link href={join} className={`${buttonClass('primary')} h-10! w-auto!`}>
            {t.start.join}
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto flex max-w-7xl flex-col min-[52rem]:h-[min(40rem,calc(100dvh-7rem))] min-[52rem]:min-h-[28rem] min-[52rem]:justify-end min-[52rem]:overflow-hidden min-[52rem]:rounded-3xl min-[52rem]:p-12 lg:p-16">
        <Image
          src={community.heroSrc}
          alt={`${community.name} riders by the water`}
          width={1280}
          height={720}
          priority
          sizes="(min-width: 832px) 90vw, 100vw"
          className="order-2 mt-6 aspect-video w-full min-w-0 rounded-2xl object-cover min-[52rem]:absolute min-[52rem]:inset-0 min-[52rem]:mt-0 min-[52rem]:aspect-auto min-[52rem]:size-full min-[52rem]:rounded-none"
        />
        <div aria-hidden className="absolute inset-0 hidden bg-linear-to-t from-black/80 via-black/30 to-black/5 min-[52rem]:block" />
        <div aria-hidden className="absolute inset-0 hidden bg-linear-to-r from-black/45 via-black/10 to-transparent min-[52rem]:block" />
        <div className="relative order-1 min-w-0 min-[52rem]:max-w-2xl">
          <p className="mb-4 hidden w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[14px] font-semibold text-white backdrop-blur min-[52rem]:inline-flex">
            <Icon name="usersSolid" className="size-4" />
            {t.start.membersOnly}
          </p>
          <h1 className="text-center text-3xl font-bold tracking-tight sm:text-4xl min-[52rem]:text-left min-[52rem]:text-5xl min-[52rem]:text-white lg:text-6xl">
            {community.name}
          </h1>
          <p className="mt-3 text-center text-[16px] text-ink-soft min-[52rem]:mt-4 min-[52rem]:text-left min-[52rem]:text-[20px] min-[52rem]:text-white/85">
            {community.headline}
          </p>
        </div>
        <div className="relative order-3 mx-auto mt-6 grid w-full max-w-sm gap-3 min-[52rem]:mx-0 min-[52rem]:mt-8 min-[52rem]:flex min-[52rem]:max-w-none">
          <Link href={login} className={`${buttonClass('primary')} min-[52rem]:w-40`}>
            {t.start.login}
          </Link>
          <Link href={join} className={`${buttonClass('secondary')} min-[52rem]:w-40 min-[52rem]:bg-white min-[52rem]:hover:bg-white/90`}>
            {t.start.join}
          </Link>
        </div>
      </section>

      <section className="mt-12 space-y-5 text-[16px] leading-relaxed text-ink min-[52rem]:hidden">
        {firstParagraph ? <p>{firstParagraph}</p> : null}
        <Image
          src={community.aboutSrc}
          alt="Two riders on a gravel path outside Stockholm"
          width={1280}
          height={720}
          sizes="100vw"
          className="aspect-video w-full rounded-2xl object-cover"
        />
        {rest.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>

      <div className="mx-auto hidden max-w-7xl min-[52rem]:block">
        <section className="mt-24 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-14 rounded-3xl bg-sunken p-12 lg:gap-20 lg:p-16">
          <div className="min-w-0">
            <p className="text-[14px] font-bold tracking-wide text-accent uppercase">{t.start.eyebrow}</p>
            <h2 className="mt-3 text-[32px] leading-tight font-bold tracking-tight lg:text-[40px]">{t.start.about(community.name)}</h2>
            {firstParagraph ? <p className="mt-5 text-[19px] leading-relaxed text-ink">{firstParagraph}</p> : null}
            <ul className="mt-6 space-y-4">
              {rest.map((paragraph) => (
                <li key={paragraph} className="flex gap-3 text-[16px] leading-relaxed text-ink-soft">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-white">
                    <Icon name="check" className="size-3.5" />
                  </span>
                  {paragraph}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex items-center gap-5">
              <Link href={join} className={`${buttonClass('primary')} w-40!`}>
                {t.start.join}
              </Link>
              <Link href={login} className="text-[16px] font-semibold text-accent hover:underline">
                {t.start.haveAccount}
              </Link>
            </div>
          </div>
          <div className="relative min-w-0">
            <Image
              src={community.aboutSrc}
              alt="Two riders on a gravel path outside Stockholm"
              width={1280}
              height={720}
              sizes="45vw"
              className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl shadow-black/10"
            />
            <div className="absolute -bottom-6 -left-6 flex items-center gap-3 rounded-2xl bg-canvas p-4 pr-6 shadow-lg shadow-black/10">
              <span className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent">
                <Icon name="usersSolid" />
              </span>
              <span>
                <span className="block text-[15px] font-bold">{t.start.approvedTitle}</span>
                <span className="block text-[14px] text-muted">{t.start.approvedBody}</span>
              </span>
            </div>
          </div>
        </section>

        <section className="mt-24">
          <h2 className="text-[28px] font-bold tracking-tight">{t.start.featuresTitle}</h2>
          <ul className="mt-8 grid grid-cols-3 gap-6">
            {features.map((feature) => (
              <li key={feature.title} className="rounded-2xl border border-line bg-canvas p-7 shadow-sm">
                <span className="grid size-12 place-items-center rounded-xl bg-accent/10 text-accent">
                  <Icon name={feature.icon} />
                </span>
                <h3 className="mt-5 text-[18px] font-bold">{feature.title}</h3>
                <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-24 flex items-center justify-between gap-10 rounded-3xl bg-accent px-14 py-12 text-white">
          <div className="min-w-0">
            <h2 className="text-[32px] leading-tight font-bold tracking-tight">{t.start.ctaTitle(community.name)}</h2>
            <p className="mt-2 text-[17px] text-white/85">{t.start.ctaBody}</p>
          </div>
          <div className="flex shrink-0 gap-3">
            <Link href={join} className={`${buttonClass('secondary')} w-40! bg-white! hover:bg-white/90!`}>
              {t.start.join}
            </Link>
            <Link href={login} className={`${buttonClass('ghost')} w-40! border-white/40! text-white! hover:bg-white/10!`}>
              {t.start.login}
            </Link>
          </div>
        </section>

        <footer className="mt-16 flex h-20 items-center justify-between border-t border-line text-[14px] text-muted">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <Image src="/icons/logo.png" alt="" width={24} height={24} className="size-6" />
            {community.name}
          </span>
          <span>{t.start.footer}</span>
        </footer>
      </div>
    </main>
  )
}
