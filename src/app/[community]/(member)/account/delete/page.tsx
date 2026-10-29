import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { DeleteAccountForm } from '@/features/account/components/DeleteAccountForm'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { t } from '@/lib/i18n'

export default function DeleteAccountPage(props: PageProps<'/[community]/account/delete'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <DeleteAccountContent {...props} />
    </Suspense>
  )
}

// Members and applicants alike can delete their account (GDPR).
async function DeleteAccountContent({ params }: PageProps<'/[community]/account/delete'>) {
  const { community } = await params
  const [viewer, info] = await Promise.all([getViewer(community), getCommunity(community)])
  if (!viewer || !info) redirect(`/${community}/login`)

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.account.title} backHref={`/${community}/profiles/${viewer.userId}`} />
      <DeleteAccountForm community={community} communityName={info.name} />
    </div>
  )
}
