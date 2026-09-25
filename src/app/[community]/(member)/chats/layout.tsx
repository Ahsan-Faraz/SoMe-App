import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getViewer } from '@/features/auth/queries'
import { ChatIndex } from '@/features/chats/components/ChatIndex'
import { listChats } from '@/features/chats/queries'

export default function ChatsLayout({ children, params }: LayoutProps<'/[community]/chats'>) {
  return (
    <div className="split:grid split:h-full split:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] split:overflow-hidden">
      <Suspense fallback={null}>
        <DesktopChats params={params} />
      </Suspense>
      <div className="min-h-dvh min-w-0 split:h-full split:overflow-y-auto">{children}</div>
    </div>
  )
}

async function DesktopChats({ params }: { params: LayoutProps<'/[community]/chats'>['params'] }) {
  const { community } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const chats = await listChats(community, Date.now())

  return (
    <aside className="hidden h-full min-h-0 flex-col border-r border-black/10 split:flex">
      <ChatIndex community={community} viewer={viewer} chats={chats} now={Date.now()} pane />
    </aside>
  )
}
