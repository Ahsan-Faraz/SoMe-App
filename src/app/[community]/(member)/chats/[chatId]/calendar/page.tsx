import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { CalendarBoard } from '@/features/calendar/components/CalendarBoard'
import { listEvents } from '@/features/calendar/queries'
import { dmHref } from '@/features/chats/links'
import { chatIdForUser, getChatSummary } from '@/features/chats/queries'
import { getGroup } from '@/features/groups/queries'
import { t } from '@/lib/i18n'

export default function CalendarPage(props: PageProps<'/[community]/chats/[chatId]/calendar'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <CalendarContent {...props} />
    </Suspense>
  )
}

async function CalendarContent({ params }: PageProps<'/[community]/chats/[chatId]/calendar'>) {
  const { community, chatId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const [chat, group, events] = await Promise.all([getChatSummary(chatId), getGroup(chatId), listEvents(chatId)])
  if (!chat || chat.kind !== 'group' || !group?.calendar) notFound()

  const base = `/${community}/chats/${chat.id}/calendar`
  const isAdmin = viewer.role === 'admin'
  const dmHrefs: Record<string, string> = {}
  for (const event of events) {
    if (event.createdBy && event.createdBy !== viewer.userId) dmHrefs[event.createdBy] = dmHref(community, event.createdBy, chatIdForUser(event.createdBy))
  }

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader
        title={chat.name}
        backHref={`/${community}/chats/${chat.id}`}
        right={
          isAdmin ? (
            <Link href={`${base}/new`} aria-label={t.calendar.add} title={t.calendar.add} className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover">
              <Icon name="plus" />
            </Link>
          ) : undefined
        }
      />
      <CalendarBoard storageKey={`some:calendar:${community}:${chat.id}`} seed={events} base={base} isAdmin={isAdmin} dmHrefs={dmHrefs} />
    </div>
  )
}
