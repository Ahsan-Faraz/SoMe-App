import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { ChatThread } from '@/features/chats/components/ChatThread'
import { getAdminChatId, getChatPage, getStatusLabels } from '@/features/chats/queries'
import type { ChatRules } from '@/features/chats/types'
import { listAlbums } from '@/features/albums/queries'
import { getCommunity } from '@/features/communities/queries'
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

// A4: the header and the newest 30 messages in one round trip; the thread then goes live.
async function ChatContent({ params }: PageProps<'/[community]/chats/[chatId]'>) {
  const { community, chatId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  const pending = viewer.role === 'pending'

  const [chat, info, statuses, adminChatId, albums] = await Promise.all([
    getChatPage(community, chatId, viewer.userId),
    getCommunity(community),
    getStatusLabels(community),
    // An applicant may only open their conversation with the admin ("Chat with admin" on A25).
    pending ? getAdminChatId(community) : null,
    // "From profile/album" for pictures: albums are on this device until backend step 13.
    listAlbums(viewer.userId),
  ])
  if (pending && chatId !== adminChatId) redirect(`/${community}/pending`)
  if (!chat || !info) notFound()

  const base = `/${community}/chats/${chat.id}`
  // B5: a DM's notes are the notes about that person — the same screen as from their profile.
  // The star (notes) is for DM chats only, not groups.
  // The No-reply DM (a DM nobody can write in that isn't blocked) has no person to keep notes on or leave.
  const system = chat.kind === 'dm' && !chat.canPost && !chat.blocked
  const notesHref = chat.otherUserId && !pending && !system ? `/${community}/profiles/${chat.otherUserId}/notes?back=${encodeURIComponent(base)}` : null
  // What the chat lets the viewer do (the group's switches; its admins may always), from the
  // database, which checks each action again.
  const rules: ChatRules = { post: chat.canPost, comment: chat.allow.comment, react: chat.allow.react, edit: chat.allow.edit, remove: true, images: chat.canPost }
  const iconLink = `${tool} hover:bg-hover`

  return (
    <div className="flex h-app w-full flex-col bg-canvas">
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
        backHref={pending ? `/${community}/pending` : `/${community}/chats`}
        right={
          <span className="flex">
            {notesHref ? (
              <Link href={notesHref} aria-label={t.chats.notes} title={t.chats.notes} className={iconLink}>
                <Icon name="star" className="size-5" />
              </Link>
            ) : null}
            {chat.kind === 'group' ? (
              <Link href={`${base}/info`} aria-label={t.groupInfo.title} title={t.groupInfo.title} className={iconLink}>
                <Icon name="info" className="size-5" />
              </Link>
            ) : null}
            {chat.kind === 'dm' && !pending && !system ? (
              <Link href={`${base}/leave`} aria-label={t.chats.leave} title={t.chats.leave} className={iconLink}>
                <Icon name="leave" className="size-5" />
              </Link>
            ) : null}
          </span>
        }
      />
      {chat.kind === 'group' && (chat.calendar || chat.infoHeadline) ? (
        <div className="flex shrink-0 items-center gap-1 border-b border-line bg-canvas px-2 py-1.5 text-ink sm:px-6">
          {chat.calendar ? (
            <Link href={`${base}/calendar`} aria-label={t.chats.calendar} title={t.chats.calendar} className={`${iconLink} shrink-0`}>
              <Icon name="calendar" className="size-5" />
            </Link>
          ) : null}
          {chat.infoHeadline ? (
            <Link href={`${base}/info/1`} className="flex h-10 min-w-0 items-center gap-1 rounded-lg px-3 text-[15px] font-bold hover:bg-hover">
              <span className="truncate">{chat.infoHeadline}</span>
              <Icon name="chevronRight" className="size-4 shrink-0 text-muted" />
            </Link>
          ) : null}
        </div>
      ) : null}
      <ChatThread
        key={chat.id}
        community={community}
        communityId={info.id}
        chatId={chat.id}
        group={chat.kind === 'group'}
        initial={chat.messages}
        hasOlder={chat.hasOlder}
        blocked={chat.blocked}
        statuses={statuses}
        viewerId={viewer.userId}
        isAdmin={chat.manage}
        rules={rules}
        albums={albums}
        backHref={base}
      />
    </div>
  )
}
