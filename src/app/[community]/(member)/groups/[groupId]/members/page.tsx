import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { MemberList } from '@/features/groups/components/MemberList'
import { getGroup, listGroupMembers } from '@/features/groups/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../../../loading'

export default function MembersPage(props: PageProps<'/[community]/groups/[groupId]/members'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <MembersContent {...props} />
    </Suspense>
  )
}

async function MembersContent({ params }: PageProps<'/[community]/groups/[groupId]/members'>) {
  const { community, groupId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'admin') redirect(`/${community}/chats`)

  const [group, members] = await Promise.all([getGroup(groupId), listGroupMembers(groupId)])
  if (!group) notFound()

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader
        title={`${group.name} – ${t.groups.members}`}
        backHref={`/${community}/groups/${group.id}`}
        right={
          <Link href={`/${community}/groups/${group.id}/add`} aria-label={t.groups.add} className="inline-flex size-11 items-center justify-center text-accent">
            <Icon name="plus" />
          </Link>
        }
      />
      <MemberList community={community} members={members} />
    </div>
  )
}
