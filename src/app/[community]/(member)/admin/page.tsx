import { Suspense } from 'react'
import { RouteSkeleton } from '@/app/[community]/loading'
import { BigLink } from '@/components/ui/BigLink'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireAdmin } from '@/features/auth/queries'
import { t } from '@/lib/i18n'

// A19: community admin menu.
export default function CommunityAdminPage(props: PageProps<'/[community]/admin'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <CommunityAdminContent {...props} />
    </Suspense>
  )
}

async function CommunityAdminContent({ params }: PageProps<'/[community]/admin'>) {
  const { community } = await params
  await requireAdmin(community)
  const base = `/${community}/admin`

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.chats.communityAdmin} backHref={`/${community}/chats`} />
      <nav aria-label={t.chats.communityAdmin} className="mx-auto grid max-w-xl gap-2 px-4 py-6 sm:px-8">
        <BigLink href={`${base}/applications`} icon="inbox" label={t.admin.applications} />
        <BigLink href={`${base}/members`} icon="users" label={t.admin.members} />
        <BigLink href={`${base}/stats`} icon="chart" label={t.admin.statistics} />
        <p className="mt-2 px-1 text-[14px] text-muted">{t.admin.more}</p>
      </nav>
    </div>
  )
}
