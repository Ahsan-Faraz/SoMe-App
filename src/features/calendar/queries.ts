import 'server-only'
import { getCommunity } from '@/features/communities/queries'
import { createClient } from '@/lib/supabase/server'
import { monthStart, toEvent, type CalMonth } from './types'

// B2: one month of a group's calendar (calendar_month: its admins, and its approved members while
// the calendar is on). The phone loads the other months itself as they are opened (CalendarBoard).
export async function getCalendarMonth(slug: string, groupId: string, month: string): Promise<CalMonth> {
  const community = await getCommunity(slug)
  if (!community) return { month, events: [] }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('calendar_month', { p_community: community.id, p_chat: groupId, p_month: monthStart(month) })
  if (error) throw error
  return { month, events: data.map(toEvent) }
}
