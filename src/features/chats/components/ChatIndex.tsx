import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import type { Viewer } from '@/features/auth/types'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { t } from '@/lib/i18n'
import type { ChatListItem } from '../types'
import { ChatList } from './ChatList'

const iconButton =
  'inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-accent'

export function ChatIndex({
  community,
  viewer,
  chats,
  now,
  pane = false,
}: {
  community: string
  viewer: Viewer
  chats: ChatListItem[]
  now: number
  pane?: boolean
}) {
  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-black/10 bg-canvas px-3">
        {pane ? null : (
          <Link href={`/${community}/profiles/${viewer.userId}`} aria-label={t.chats.yourProfile} className="rail:hidden">
            <Avatar name={viewer.username} seed={viewer.userId} size="sm" />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate pl-1 text-[18px] font-bold">{t.chats.title}</h1>
        <div className="flex items-center">
          {viewer.role === 'admin' ? (
            <Link href={`/${community}/groups/new`} aria-label={t.chats.newGroup} title={t.chats.newGroup} className={iconButton}>
              <Icon name="usersPlus" className="size-[22px]" />
            </Link>
          ) : null}
          <Link href={`/${community}/chats/new`} aria-label={t.chats.newChat} title={t.chats.newChat} className={iconButton}>
            <Icon name="plus" className="size-6" />
          </Link>
          {pane ? null : <LogoutButton community={community} className={`${iconButton} rail:hidden`} />}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] rail:pb-0">
        <ChatList community={community} chats={chats} now={now} />
      </div>
    </>
  )
}
