import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getCommunity } from '@/features/communities/queries'
import { termsEn } from '@/lib/i18n/terms.en'
import { RouteSkeleton } from '../loading'

// Terms of use, linked from the start page next to the privacy terms. Public: no login needed.
// A placeholder until the client provides the real terms.
export default function TermsPage(props: PageProps<'/[community]/terms'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <TermsContent {...props} />
    </Suspense>
  )
}

async function TermsContent({ params }: PageProps<'/[community]/terms'>) {
  const { community: slug } = await params
  const community = await getCommunity(slug)
  if (!community) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={termsEn.title} backHref={`/${slug}`} />
      <main className="mx-auto grid max-w-2xl gap-6 px-5 py-6 pb-16 text-[16px] leading-relaxed sm:px-8">
        <p className="text-ink-soft">{termsEn.intro(community.name)}</p>
        {termsEn.sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-[17px] font-bold">{section.title}</h2>
            <p className="mt-1 text-ink-soft">{section.body}</p>
          </section>
        ))}
      </main>
    </div>
  )
}
