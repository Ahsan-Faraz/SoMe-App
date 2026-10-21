import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { getAdminChatId } from '@/features/chats/queries'
import { getCommunity } from '@/features/communities/queries'
import { ApplicationForm } from '@/features/membership/components/ApplicationForm'
import { getProfileSchema } from '@/features/fields/queries'
import { getMyApplication, getScope } from '@/features/membership/queries'
import { getProfile } from '@/features/profiles/queries'
import { missingRequired } from '@/features/profiles/required'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../loading'

// A25: logged in but not approved yet — apply to the community. Before applying it lists the profile
// fields still to fill in; after applying it shows what was sent.
export default function PendingPage(props: PageProps<'/[community]/pending'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <PendingContent {...props} />
    </Suspense>
  )
}

async function PendingContent({ params }: PageProps<'/[community]/pending'>) {
  const { community } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'pending') redirect(`/${community}/chats`)

  const [scope, profile, adminChatId, info, sent] = await Promise.all([
    getScope('community', community),
    getProfile(community, viewer.userId),
    getAdminChatId(community),
    getCommunity(community),
    getMyApplication(community),
  ])
  if (!scope || !profile || !info) notFound()
  const applied = profile.state === 'applied'
  const missing = applied ? [] : missingRequired(await getProfileSchema(info.id), profile)

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={t.apply.title(scope.name)} right={<ThemeToggle className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover" />} />
      {/* Keyed by applied: once sent, the form opens fresh with what the database saved. */}
      <ApplicationForm
        key={applied ? 'sent' : 'new'}
        community={community}
        communityId={info.id}
        scope={{ kind: scope.kind, id: scope.id, applicationText: scope.applicationText, requires: scope.requires }}
        applied={applied}
        sent={applied ? sent : null}
        missing={missing}
        applicantId={profile.id}
        profileHref={`/${community}/profiles/${viewer.userId}`}
        chatHref={adminChatId ? `/${community}/chats/${adminChatId}` : null}
      />
    </div>
  )
}
