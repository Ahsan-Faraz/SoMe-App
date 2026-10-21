import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { getGroupInfo } from '@/features/groups/queries'
import { t } from '@/lib/i18n'

export default function GroupInfoPage(props: PageProps<'/[community]/chats/[chatId]/info'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <GroupInfoContent {...props} />
    </Suspense>
  )
}

async function GroupInfoContent({ params }: PageProps<'/[community]/chats/[chatId]/info'>) {
  const { community, chatId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  // Its members and admins only (group_info); the member list when the group shows it.
  const group = await getGroupInfo(community, chatId)
  if (!group) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.groupInfo.title} backHref={`/${community}/chats/${group.id}`} />
      <main className="mx-auto grid max-w-2xl gap-8 px-5 py-8 sm:px-8">
        <section className="grid justify-items-center gap-3 text-center">
          <Avatar name={group.name} seed={group.id} shape="square" size="lg" />
          <h2 className="text-[24px] leading-tight font-bold">{group.name}</h2>
          <p className="text-[16px] text-ink-soft">{group.headline}</p>
        </section>

        {group.infos.length > 0 ? (
        <section>
          <h3 className="mb-2 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{t.groupInfo.info}</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {group.infos.map((post) => (
              <li key={post.n}>
                <Link
                  href={`/${community}/chats/${group.id}/info/${post.n}`}
                  className="flex h-14 items-center gap-3 px-4 text-[16px] font-semibold hover:bg-hover"
                >
                  <span className="grid size-7 place-items-center rounded-lg bg-rail text-[13px] font-bold">{post.n}</span>
                  <span className="min-w-0 flex-1 truncate">{post.headline}</span>
                  <Icon name="chevronRight" className="size-5 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        ) : null}

        <section>
          {group.members ? (
            <>
              <h3 className="mb-2 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{t.groupInfo.members(group.memberCount ?? group.members.length)}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {group.members.map((member) => (
                  <li key={member.id} className="[contain-intrinsic-size:auto_60px] [content-visibility:auto]">
                    <Link href={`/${community}/profiles/${member.id}?back=${encodeURIComponent(`/${community}/chats/${group.id}/info`)}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                      <Avatar name={member.username} seed={member.id} size="sm" src={member.icon} />
                      <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{member.username}</span>
                      {member.admin ? <span className="shrink-0 text-[13px] font-semibold text-accent">{t.groupInfo.admin}</span> : null}
                      <Icon name="chevronRight" className="size-5 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="rounded-2xl bg-sunken px-4 py-4 text-center text-[15px] text-muted">{t.groupInfo.hidden}</p>
          )}
        </section>

        {group.manage ? (
          <Link
            href={`/${community}/groups/${group.id}`}
            className="flex h-14 items-center gap-3 rounded-2xl border border-line px-4 text-[16px] font-semibold hover:bg-hover"
          >
            <Icon name="users" className="size-5 shrink-0" />
            <span className="flex-1">{t.groups.edit}</span>
            <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
          </Link>
        ) : null}

        {/* The group admin can't leave their group (set another admin first). */}
        {group.member && !group.admin ? (
          <Link
            href={`/${community}/chats/${group.id}/leave`}
            className="flex h-14 items-center gap-3 rounded-2xl border border-line px-4 text-[16px] font-semibold text-danger hover:bg-hover"
          >
            <Icon name="leave" className="size-5 shrink-0" />
            <span className="flex-1">{t.groupInfo.leave}</span>
          </Link>
        ) : null}
      </main>
    </div>
  )
}
