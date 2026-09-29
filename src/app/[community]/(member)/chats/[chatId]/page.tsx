import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { ChatThread } from '@/features/chats/components/ChatThread'
import { dmPartnerId, getChat } from '@/features/chats/queries'
import { listAlbums } from '@/features/albums/queries'
import { getGroup, getInfoPost } from '@/features/groups/queries'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../../loading'

const tool = 'inline-flex size-10 items-center justify-center rounded-lg text-[15px] font-bold'

export default function ChatPage(props: PageProps<'/[community]/chats/[chatId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ChatContent {...props} />
    </Suspense>
  )
}

async function ChatContent({ params }: PageProps<'/[community]/chats/[chatId]'>) {
  const { community, chatId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)

  const now = Date.now()
  const [chat, group, info, albums] = await Promise.all([getChat(chatId, now), getGroup(chatId), getInfoPost(chatId, 1), listAlbums(viewer.userId)])
  if (!chat) notFound()

  const base = `/${community}/chats/${chat.id}`
  const admin = viewer.role === 'admin'
  const partner = chat.kind === 'dm' ? dmPartnerId(chat.id) : null
  // B5: a DM's notes are the notes about that person — the same screen as from their profile.
  const notesHref = partner ? `/${community}/profiles/${partner}/notes?back=${encodeURIComponent(base)}` : `${base}/notes`
  const rules = {
    post: admin || !group || group.posting,
    comment: admin || !group || group.commenting,
    react: admin || !group || group.reactions,
    edit: admin || !group || group.editPosts,
  }
  const iconLink = `${tool} hover:bg-hover`

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
          <span className="flex">
            <Link href={notesHref} aria-label={t.chats.notes} title={t.chats.notes} className={iconLink}>
              <Icon name="star" className="size-5" />
            </Link>
            {chat.kind === 'group' && group ? (
              <Link href={`${base}/info`} aria-label={t.groupInfo.title} title={t.groupInfo.title} className={iconLink}>
                <Icon name="info" className="size-5" />
              </Link>
            ) : null}
            {chat.kind === 'dm' ? (
              <Link href={`${base}/leave`} aria-label={t.chats.leave} title={t.chats.leave} className={iconLink}>
                <Icon name="leave" className="size-5" />
              </Link>
            ) : null}
          </span>
        }
      />
      {chat.kind === 'group' && (group?.calendar || info) ? (
        <div className="sticky top-14 z-10 flex items-center gap-1 border-b border-line bg-canvas px-2 py-1.5 text-ink sm:px-6">
          {group?.calendar ? (
            <Link href={`${base}/calendar`} aria-label={t.chats.calendar} title={t.chats.calendar} className={`${iconLink} shrink-0`}>
              <Icon name="calendar" className="size-5" />
            </Link>
          ) : null}
          {info ? (
            <Link href={`${base}/info/1`} className="flex h-10 min-w-0 items-center gap-1 rounded-lg px-3 text-[15px] font-bold hover:bg-hover">
              <span className="truncate">{info.headline}</span>
              <Icon name="chevronRight" className="size-4 shrink-0 text-muted" />
            </Link>
          ) : null}
        </div>
      ) : null}
      <ChatThread community={community} chatId={chat.id} backHref={base} messages={chat.messages} isAdmin={admin} rules={rules} viewerId={viewer.userId} albums={albums} />
    </div>
  )
}
