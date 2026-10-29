import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { EventForm } from '@/features/calendar/components/EventForm'
import { getCalendarMonth } from '@/features/calendar/queries'
import { getChatHeader } from '@/features/chats/queries'
import { getCommunity } from '@/features/communities/queries'
import { todayKey } from '@/lib/format'
import { t } from '@/lib/i18n'

export default function EventPage(props: PageProps<'/[community]/chats/[chatId]/calendar/[eventId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <EventContent {...props} />
    </Suspense>
  )
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

// "new" adds an event on ?date= (today by default); an id edits that event, read from the month of
// its ?date= (one call, the calendar's own).
async function EventContent({ params, searchParams }: PageProps<'/[community]/chats/[chatId]/calendar/[eventId]'>) {
  const { community, chatId, eventId } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)

  const requested = (await searchParams).date
  const asked = Array.isArray(requested) ? requested[0] : requested
  const date = asked && DAY.test(asked) ? asked : todayKey()
  const creating = eventId === 'new'

  const [chat, info, month] = await Promise.all([
    getChatHeader(community, chatId),
    getCommunity(community),
    creating ? null : getCalendarMonth(community, chatId, date.slice(0, 7)),
  ])
  if (!chat || !info || chat.kind !== 'group' || !chat.calendar) notFound()
  // Only the group's admins (group admin or community admin) edit events.
  if (!chat.manage) redirect(`/${community}/chats/${chatId}/calendar`)
  const event = month?.events.find((item) => item.id === eventId) ?? null
  if (!creating && !event) notFound()

  const shown = event?.date ?? date
  const backHref = `/${community}/chats/${chat.id}/calendar?m=${shown.slice(0, 7)}&d=${Number(shown.slice(8))}`

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={chat.name} backHref={backHref} />
      <p className="px-4 pt-5 text-center text-[15px] font-semibold text-muted sm:px-8">{t.calendar.title}</p>
      <EventForm
        key={event ? `${event.id}|${event.date}|${event.headline}|${event.text}` : `new|${date}`}
        community={community}
        communityId={info.id}
        chatId={chat.id}
        backHref={backHref}
        event={event}
        date={date}
      />
    </div>
  )
}
