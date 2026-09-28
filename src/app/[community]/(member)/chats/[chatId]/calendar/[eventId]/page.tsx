import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { EventForm } from '@/features/calendar/components/EventForm'
import { listEvents } from '@/features/calendar/queries'
import { getChatSummary } from '@/features/chats/queries'
import { getGroup } from '@/features/groups/queries'
import { t } from '@/lib/i18n'

export default function EventPage(props: PageProps<'/[community]/chats/[chatId]/calendar/[eventId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <EventContent {...props} />
    </Suspense>
  )
}

async function EventContent({ params, searchParams }: PageProps<'/[community]/chats/[chatId]/calendar/[eventId]'>) {
  const { community, chatId, eventId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role !== 'admin') redirect(`/${community}/chats/${chatId}/calendar`)

  const [chat, group, events] = await Promise.all([getChatSummary(chatId), getGroup(chatId), listEvents(chatId)])
  if (!chat || chat.kind !== 'group' || !group?.calendar) notFound()

  const creating = eventId === 'new'
  const requested = (await searchParams).date
  const date = Array.isArray(requested) ? requested[0] : requested
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="min-h-dvh w-full bg-canvas">
      <ScreenHeader title={chat.name} backHref={`/${community}/chats/${chat.id}/calendar`} />
      <p className="px-4 pt-5 text-center text-[15px] font-semibold text-muted sm:px-8">{t.calendar.title}</p>
      <EventForm storageKey={`some:calendar:${community}:${chat.id}`} seed={events} eventId={creating ? null : eventId} date={date || today} />
    </div>
  )
}
