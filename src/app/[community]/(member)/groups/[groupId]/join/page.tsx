import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { Avatar } from '@/components/ui/Avatar'
import { bottomBar, scrollArea } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { JoinGroupButton } from '@/features/groups/components/JoinGroupButton'
import { getGroupCard } from '@/features/groups/queries'
import { ApplicationForm } from '@/features/membership/components/ApplicationForm'
import { t } from '@/lib/i18n'

// A group found with "Find new user/group": join straight away, or apply (A24) when direct join is off.
// Already in it: its chat.
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

  const [group, info] = await Promise.all([getGroupCard(community, groupId), getCommunity(community)])
  if (!group || !info) notFound()
  if (group.member) redirect(`/${community}/chats/${group.id}`)
  const backHref = `/${community}/chats/new`

  if (!group.directJoin) {
    return (
      <div className="flex h-app w-full flex-col bg-canvas">
        <ScreenHeader title={t.apply.title(group.name)} backHref={backHref} />
        <ApplicationForm
          key={group.applied ? 'sent' : 'new'}
          community={community}
          communityId={info.id}
          scope={{ kind: 'group', id: group.id, applicationText: group.applicationText, requires: { ...group.requires, identity: false } }}
          applicantId={viewer.userId}
          applied={group.applied}
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
          <JoinGroupButton community={community} groupId={group.id} />
        </div>
      </div>
    </div>
  )
}
