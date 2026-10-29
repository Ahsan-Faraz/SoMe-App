import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { CalendarBoard } from '@/features/calendar/components/CalendarBoard'
import { getCalendarMonth } from '@/features/calendar/queries'
import { isMonth } from '@/features/calendar/types'
import { getChatHeader } from '@/features/chats/queries'
import { getCommunity } from '@/features/communities/queries'
import { todayKey } from '@/lib/format'
import { t } from '@/lib/i18n'

export default function CalendarPage(props: PageProps<'/[community]/chats/[chatId]/calendar'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <CalendarContent {...props} />
    </Suspense>
  )
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

// B2: opens on ?m=YYYY-MM&d=DD (back from an event), else today in the community's zone.
async function CalendarContent({ params, searchParams }: PageProps<'/[community]/chats/[chatId]/calendar'>) {
  const { community, chatId } = await params
  const query = await searchParams
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const today = todayKey()
  const asked = first(query.m)
  const month = isMonth(asked) ? asked : today.slice(0, 7)
  const askedDay = Number(first(query.d))
  const day = Number.isInteger(askedDay) && askedDay >= 1 && askedDay <= 31 ? askedDay : month === today.slice(0, 7) ? Number(today.slice(8)) : 1

  const [chat, info, initial] = await Promise.all([getChatHeader(community, chatId), getCommunity(community), getCalendarMonth(community, chatId, month)])
  if (!chat || !info || chat.kind !== 'group' || !chat.calendar) notFound()

  const base = `/${community}/chats/${chat.id}/calendar`
  // The group's admins (group admin or community admin) run its calendar.
  const isAdmin = chat.manage

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
      {/* Keyed by where it opens: back from an event in another month opens on that month. */}
      <CalendarBoard key={`${month}-${day}`} community={community} communityId={info.id} chatId={chat.id} initial={initial} day={day} base={base} isAdmin={isAdmin} />
    </div>
  )
}
