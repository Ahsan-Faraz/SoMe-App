import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { JoinForm } from '@/features/auth/components/JoinForm'
import { getCommunity } from '@/features/communities/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../loading'

export default function JoinPage(props: PageProps<'/[community]/join'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <JoinContent {...props} />
    </Suspense>
  )
}

async function JoinContent({ params }: PageProps<'/[community]/join'>) {
  const { community: slug } = await params
  const community = await getCommunity(slug)
  if (!community) notFound()

  return (
    <>
      <ScreenHeader title={t.join.title} backHref={`/${slug}`} />
      <main className="mx-auto max-w-md px-6 pt-6 pb-12">
        <JoinForm community={slug} communityName={community.name} />
      </main>
    </>
  )
}
