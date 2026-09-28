import 'server-only'
import { mockEvents } from '@/mocks/data'
import type { CalEvent } from './storage'

export async function listEvents(groupId: string): Promise<CalEvent[]> {
  return mockEvents
    .filter((event) => event.groupId === groupId)
    .map(({ id, date, headline, text }) => ({ id, date, headline, text }))
}
