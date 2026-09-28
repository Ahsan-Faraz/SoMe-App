import type { Album } from './types'

export function loadAlbums(key: string, seed: Album[]): Album[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '') as Album[]
    return Array.isArray(parsed) ? parsed : seed
  } catch {
    return seed
  }
}

export function saveAlbums(key: string, albums: Album[]) {
  localStorage.setItem(key, JSON.stringify(albums))
}

export function albumKey(community: string, userId: string) {
  return `some:albums:${community}:${userId}`
}

export function todayLabel() {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
}
