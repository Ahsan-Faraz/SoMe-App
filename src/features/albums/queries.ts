import 'server-only'
import type { Album } from './types'

const seed: Record<string, Album[]> = {
  'u-me': [
    {
      id: 'me-sunday',
      name: 'Sunday rides',
      password: '',
      images: [{ id: 'me-1', src: '/community/ride.png', date: '14 Sep 2026', verified: true }],
    },
  ],
  'u-anna': [
    {
      id: 'anna-gravel',
      name: 'Gravel',
      password: 'ride',
      images: [{ id: 'anna-1', src: '/community/ride.png', date: '12 Sep 2026', verified: true }],
    },
  ],
}

export async function listAlbums(userId: string): Promise<Album[]> {
  return seed[userId] ?? []
}
