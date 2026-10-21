import 'server-only'
import type { CalEvent } from './storage'

// A group's calendar events from the database arrive with backend step 12 (`events`). Until then the
// calendar starts empty and keeps what the group admin adds on this device (CalendarBoard).
export async function listEvents(_groupId: string): Promise<CalEvent[]> {
  return []
}
