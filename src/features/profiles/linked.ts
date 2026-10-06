import { MAX_LINKED } from './options'
import type { LinkedProfile } from './types'

// A32 linked profiles, on this device until the profile_links table exists.
export function linkedKey(community: string, userId: string) {
  return `some:linked:${community}:${userId}`
}

export function readLinked(key: string): LinkedProfile[] | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as LinkedProfile[] | null
    return Array.isArray(saved) ? saved.slice(0, MAX_LINKED) : null
  } catch {
    return null
  }
}

export function writeLinked(key: string, list: LinkedProfile[]) {
  localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_LINKED)))
}
