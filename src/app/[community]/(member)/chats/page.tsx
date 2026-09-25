import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/BottomNav'
import { buttonClass } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { getViewer } from '@/features/auth/queries'
import { ChatIndex } from '@/features/chats/components/ChatIndex'
import { listChats } from '@/features/chats/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../loading'

export default function ChatsPage(props: PageProps<'/[community]/chats'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ChatsContent {...props} />
    </Suspense>
  )
}

async function ChatsContent({ params }: PageProps<'/[community]/chats'>) {
  const { community } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const now = Date.now()
  const chats = await listChats(community, now)

  return (
    <>
      <div className="flex min-h-dvh flex-col bg-canvas split:hidden">
        <ChatIndex community={community} viewer={viewer} chats={chats} now={now} />
        <BottomNav community={community} active="chats" />
      </div>
      <div className="hidden h-full flex-col items-center justify-center gap-3 bg-sunken px-6 text-center split:flex">
        <span className="grid size-16 place-items-center rounded-2xl bg-accent/10 text-accent">
          <Icon name="chatSolid" className="size-8" />
        </span>
        <p className="mt-2 text-[20px] font-bold text-ink">{t.chats.pick}</p>
        <p className="max-w-xs text-[15px] text-muted">{t.chats.pickHint}</p>
        <div className="mt-3 flex gap-3">
          <Link href={`/${community}/chats/new`} className={`${buttonClass('primary')} w-auto! px-6`}>
            {t.chats.newChat}
          </Link>
          {viewer.role === 'admin' ? (
            <Link href={`/${community}/groups/new`} className={`${buttonClass('secondary')} w-auto! px-6`}>
              {t.chats.newGroup}
            </Link>
          ) : null}
        </div>
      </div>
    </>
  )
}
