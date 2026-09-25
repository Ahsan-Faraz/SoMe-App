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
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const group = await getGroupInfo(chatId, viewer.role === 'admin')
  if (!group) notFound()

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={t.groupInfo.title} backHref={`/${community}/chats/${group.id}`} />
      <main className="mx-auto grid max-w-2xl gap-8 px-5 py-8 sm:px-8">
        <section className="grid justify-items-center gap-3 text-center">
          <Avatar name={group.name} seed={group.id} shape="square" size="lg" />
          <h2 className="text-[24px] leading-tight font-bold">{group.name}</h2>
          <p className="text-[16px] text-ink-soft">{group.headline}</p>
        </section>

        <section>
          <h3 className="mb-2 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{t.groupInfo.info}</h3>
          <ul className="divide-y divide-black/10 overflow-hidden rounded-2xl border border-black/10">
            {group.infoHeadlines.map((headline, index) => (
              <li key={headline}>
                <Link
                  href={`/${community}/chats/${group.id}/info/${index + 1}`}
                  className="flex h-14 items-center gap-3 px-4 text-[16px] font-semibold hover:bg-black/[0.04]"
                >
                  <span className="grid size-7 place-items-center rounded-lg bg-rail text-[13px] font-bold">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{headline}</span>
                  <Icon name="chevronRight" className="size-5 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          {group.members ? (
            <>
              <h3 className="mb-2 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{t.groupInfo.members(group.members.length)}</h3>
              <ul className="divide-y divide-black/10 overflow-hidden rounded-2xl border border-black/10">
                {group.members.map((member) => (
                  <li key={member.id} className="[contain-intrinsic-size:auto_60px] [content-visibility:auto]">
                    <Link href={`/${community}/profiles/${member.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.04]">
                      <Avatar name={member.username} seed={member.id} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{member.username}</span>
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
      </main>
    </div>
  )
}
