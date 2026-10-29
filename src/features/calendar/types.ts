import type { Database } from '@/lib/supabase/database.types'

// A calendar event (B2). date: 'YYYY-MM-DD'. creatorId: who "DM Admin" writes to; null when that DM
// can't open (your own event, a block, or the creator is no longer a member).
export type CalEvent = { id: string; date: string; headline: string; text: string; creatorId: string | null }

// One month of a group's calendar, as calendar_month reads it. month: 'YYYY-MM'.
export type CalMonth = { month: string; events: CalEvent[] }

type EventRow = Database['public']['Functions']['calendar_month']['Returns'][number]

export function toEvent(row: EventRow): CalEvent {
  return { id: row.id, date: row.on_date, headline: row.headline, text: row.body, creatorId: row.created_by ?? null }
}

// 'YYYY-MM' → the month's first day, the argument calendar_month takes.
export const monthStart = (month: string) => `${month}-01`

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
export const isMonth = (value: unknown): value is string => typeof value === 'string' && MONTH.test(value)
