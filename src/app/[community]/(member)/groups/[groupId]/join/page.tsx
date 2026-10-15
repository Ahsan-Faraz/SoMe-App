import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { Avatar } from '@/components/ui/Avatar'
import { buttonClass } from '@/components/ui/Button'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { ApplicationForm } from '@/features/membership/components/ApplicationForm'
import { getScope } from '@/features/membership/queries'
import { getGroup } from '@/features/groups/queries'
import { getProfile } from '@/features/profiles/queries'
import { t } from '@/lib/i18n'

// A group found with "Find new user/group": join straight away, or apply (A24) when direct join is off.
export default function JoinGroupPage(props: PageProps<'/[community]/groups/[groupId]/join'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <JoinGroupContent {...props} />
    </Suspense>
  )
}

async function JoinGroupContent({ params }: PageProps<'/[community]/groups/[groupId]/join'>) {
  const { community, groupId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const group = await getGroup(groupId)
  if (!group) notFound()
  const backHref = `/${community}/chats/new`

  if (!group.directJoin) {
    const [scope, profile] = await Promise.all([getScope('group', community, groupId), getProfile(community, viewer.userId)])
    if (!scope || !profile) notFound()
    return (
      <div className="flex h-app w-full flex-col bg-canvas">
        <ScreenHeader title={t.apply.title(group.name)} backHref={backHref} />
        <ApplicationForm
          community={community}
          scope={{ kind: scope.kind, id: scope.id, applicationText: scope.applicationText, requires: scope.requires }}
          applicant={{ userId: profile.id, username: profile.username, status: profile.status }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
      <ScreenHeader title={group.name} backHref={backHref} />
      <main className={scrollArea}>
        <div className="mx-auto grid max-w-lg justify-items-center gap-3 px-5 py-8 text-center sm:px-8">
          <Avatar name={group.name} seed={group.id} shape="square" size="lg" />
          <h2 className="text-[22px] leading-tight font-bold">{group.name}</h2>
          <p className="text-[16px] text-ink-soft">{group.headline}</p>
        </div>
      </main>
      <div className={bottomBar}>
        <div className="mx-auto max-w-lg">
          <Link href={`/${community}/chats`} className={buttonClass('primary')}>
            {t.groups.join}
          </Link>
        </div>
      </div>
    </div>
  )
}
