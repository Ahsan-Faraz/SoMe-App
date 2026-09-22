import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/BottomNav'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { getViewer } from '@/features/auth/queries'
import { ChatList } from '@/features/chats/components/ChatList'
import { listChats } from '@/features/chats/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../loading'

const iconButton =
  'inline-flex size-10 items-center justify-center rounded-full text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent'

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
      <header className="sticky top-0 z-10 grid h-14 grid-cols-[5.5rem_1fr_5.5rem] items-center border-b border-neutral-200 bg-white/95 px-3 backdrop-blur">
        <Link href={`/${community}/profiles/${viewer.userId}`} aria-label={t.chats.yourProfile} className="justify-self-start">
          <Avatar name={viewer.username} seed={viewer.userId} size="sm" />
        </Link>
        <h1 className="text-center text-lg font-semibold">{t.chats.title}</h1>
        <div className="flex justify-end gap-1">
          {viewer.role === 'admin' ? (
            <Link href={`/${community}/groups/new`} aria-label={t.chats.newGroup} className={iconButton}>
              <Icon name="usersPlus" />
            </Link>
          ) : null}
          <Link href={`/${community}/chats/new`} aria-label={t.chats.newChat} className={iconButton}>
            <Icon name="plus" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <ChatList community={community} chats={chats} now={now} />
      </main>

      <BottomNav community={community} active="chats" />
    </>
  )
}
