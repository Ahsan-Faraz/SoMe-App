export type CalEvent = { id: string; date: string; headline: string; text: string }

export function loadEvents(key: string, seed: CalEvent[]): CalEvent[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return seed
    const parsed = JSON.parse(raw) as CalEvent[]
    return Array.isArray(parsed) ? parsed : seed
  } catch {
    return seed
  }
}

const listeners = new Set<() => void>()

export function saveEvents(key: string, events: CalEvent[]) {
  localStorage.setItem(key, JSON.stringify(events))
  listeners.forEach((listener) => listener())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
