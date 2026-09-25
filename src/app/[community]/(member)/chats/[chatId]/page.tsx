import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { ChatThread } from '@/features/chats/components/ChatThread'
import { getChat } from '@/features/chats/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../../loading'

// Calendar (B1) and leave (G2) are not built yet, so they open an in-page note instead of a route.
const panels = [
  { id: 'calendar', label: t.chats.calendar, text: 'Tuesday ride. Meet at Slussen, 18:00.' },
  { id: 'leave', label: t.chats.leave, text: 'Leave this group. The room stays for everyone else.' },
]

const tool = 'inline-flex size-10 items-center justify-center rounded-lg text-[15px] font-bold'
const active = 'bg-accent text-white'

export default function ChatPage(props: PageProps<'/[community]/chats/[chatId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ChatContent {...props} />
    </Suspense>
  )
}

async function ChatContent({ params, searchParams }: PageProps<'/[community]/chats/[chatId]'>) {
  const { community, chatId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)

  const now = Date.now()
  const chat = await getChat(chatId, now)
  if (!chat) notFound()

  const requested = (await searchParams).panel
  const panelId = Array.isArray(requested) ? requested[0] : requested
  const panel = chat.kind === 'group' ? panels.find((item) => item.id === panelId) : undefined
  const base = `/${community}/chats/${chat.id}`

  return (
    <div className="flex min-h-dvh w-full flex-col bg-canvas lg:min-h-full">
      <ScreenHeader
        title={
          chat.kind === 'group' ? (
            <Link href={`${base}/info`} className="text-ink hover:underline">
              {chat.name}
            </Link>
          ) : (
            chat.name
          )
        }
        backHref={viewer.role === 'pending' ? `/${community}/pending` : `/${community}/chats`}
        right={
          <Link href={`${base}/notes`} aria-label={t.chats.notes} title={t.chats.notes} className={`${tool} hover:bg-black/5`}>
            <Icon name="note" className="size-5" />
          </Link>
        }
      />
      {chat.kind === 'group' ? (
        <div className="sticky top-14 z-10 flex items-center justify-between gap-1 border-b border-black/10 bg-canvas px-2 py-1.5 text-ink sm:px-6">
          <span className="flex gap-1">
            <Link href={`${base}?panel=calendar`} aria-label={t.chats.calendar} title={t.chats.calendar} className={`${tool} ${panel?.id === 'calendar' ? active : 'hover:bg-black/5'}`}>
              <Icon name="calendar" className="size-5" />
            </Link>
            {[1, 2, 3].map((n) => (
              <Link key={n} href={`${base}/info/${n}`} aria-label={t.chats.info(n)} title={t.chats.info(n)} className={`${tool} hover:bg-black/5`}>
                {n}
              </Link>
            ))}
          </span>
          <span className="flex gap-1">
            <Link href={`${base}/info`} aria-label={t.groupInfo.title} title={t.groupInfo.title} className={`${tool} hover:bg-black/5`}>
              <Icon name="info" className="size-5" />
            </Link>
            <Link href={`${base}?panel=leave`} aria-label={t.chats.leave} title={t.chats.leave} className={`${tool} ${panel?.id === 'leave' ? active : 'hover:bg-black/5'}`}>
              <Icon name="leave" className="size-5" />
            </Link>
          </span>
        </div>
      ) : null}
      {panel ? (
        <div className="border-b border-black/10 bg-sunken px-4 py-3 sm:px-8">
          <p className="text-[14px] font-bold">{panel.label}</p>
          <p className="mt-0.5 text-[15px] leading-relaxed text-ink-soft">{panel.text}</p>
        </div>
      ) : null}
      <ChatThread community={community} chatId={chat.id} messages={chat.messages} isAdmin={viewer.role === 'admin'} />
    </div>
  )
}
