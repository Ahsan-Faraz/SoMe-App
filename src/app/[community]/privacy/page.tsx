import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { CookieSettingsButton } from '@/components/CookieConsent'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getCommunity } from '@/features/communities/queries'
import { privacyEn } from '@/lib/i18n/privacy.en'
import { RouteSkeleton } from '../loading'

// Privacy terms, linked from the start page and the cookie banner. Public: no login needed.
export default function PrivacyPage(props: PageProps<'/[community]/privacy'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <PrivacyContent {...props} />
    </Suspense>
  )
}

async function PrivacyContent({ params }: PageProps<'/[community]/privacy'>) {
  const { community: slug } = await params
  const community = await getCommunity(slug)
  if (!community) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={privacyEn.title} backHref={`/${slug}`} />
      <main className="mx-auto grid max-w-2xl gap-6 px-5 py-6 pb-16 text-[16px] leading-relaxed sm:px-8">
        <p className="text-ink-soft">{privacyEn.intro(community.name)}</p>
        {privacyEn.sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-[17px] font-bold">{section.title}</h2>
            <p className="mt-1 text-ink-soft">{section.body}</p>
          </section>
        ))}
        <CookieSettingsButton className="h-11 w-fit rounded-xl bg-rail px-4 text-[15px] font-semibold text-ink hover:bg-soft-hover" />
      </main>
    </div>
  )
}
