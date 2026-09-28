// Fixed zone so server and browser render the same text (no hydration mismatch).
const TIME_ZONE = 'Europe/Stockholm'

const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE })
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: TIME_ZONE })
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TIME_ZONE })
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })

const DAY_MS = 86_400_000

export function formatChatTime(iso: string, now: number): string {
  const date = new Date(iso)
  if (dayKeyFormat.format(date) === dayKeyFormat.format(now)) return timeFormat.format(date)
  if (now - date.getTime() < 6 * DAY_MS) return weekdayFormat.format(date)
  return dateFormat.format(date)
}

const stampFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE })

const postDateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TIME_ZONE })

// A post's published date + time: "28 Sept, 21:09".
export function formatPostTime(iso: string): string {
  const date = new Date(iso)
  return `${postDateFormat.format(date)}, ${timeFormat.format(date)}`
}

// Full date and time, e.g. for when a camera photo was verified.
export function formatStamp(iso: string | number): string {
  return stampFormat.format(new Date(iso))
}
