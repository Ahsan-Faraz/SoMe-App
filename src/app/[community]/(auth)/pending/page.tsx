import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { getAdminChatId } from '@/features/chats/queries'
import { ApplicationForm } from '@/features/membership/components/ApplicationForm'
import { getScope } from '@/features/membership/queries'
import { getProfile } from '@/features/profiles/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../loading'

// A25: logged in but not approved yet — apply to the community.
export default function PendingPage(props: PageProps<'/[community]/pending'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <PendingContent {...props} />
    </Suspense>
  )
}

async function PendingContent({ params }: PageProps<'/[community]/pending'>) {
  const { community } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'pending') redirect(`/${community}/chats`)

  const [scope, profile, adminChatId] = await Promise.all([
    getScope('community', community),
    getProfile(viewer.userId, viewer.userId, viewer.username),
    getAdminChatId(community),
  ])
  if (!scope || !profile) notFound()

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={t.apply.title(scope.name)} right={<ThemeToggle className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover" />} />
      <ApplicationForm
        community={community}
        scope={{ kind: scope.kind, id: scope.id, applicationText: scope.applicationText, requires: scope.requires }}
        applicant={{ userId: profile.id, username: profile.username, status: profile.status }}
        profileHref={`/${community}/profiles/${viewer.userId}`}
        chatHref={adminChatId ? `/${community}/chats/${adminChatId}` : null}
      />
    </div>
  )
}
