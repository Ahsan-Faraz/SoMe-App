import { notFound } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { getCommunity } from '@/features/communities/queries'
import { t } from '@/lib/i18n'

export default async function LoginPage({ params }: PageProps<'/[community]/login'>) {
  const { community: slug } = await params
  const community = await getCommunity(slug)
  if (!community) notFound()

  return (
    <>
      <ScreenHeader title={t.login.title} backHref={`/${slug}`} />
      <main className="mx-auto max-w-md px-6 pt-8 pb-12">
        <LoginForm community={slug} />
      </main>
    </>
  )
}
