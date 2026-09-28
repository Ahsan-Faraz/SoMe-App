import 'server-only'
import type { Ad } from './types'

const seed: Ad[] = [
  {
    id: 'ad-anna',
    userId: 'u-anna',
    username: 'Anna Lind',
    status: 'Woman',
    age: 34,
    district: 'Södermalm',
    place: 'Södermalm',
    headline: 'Gravel partner for Tuesdays',
    body: 'Looking for someone who rides the Slussen loop. Lights on, conversational pace.',
    published: '20 Sep 2026',
    lookingFor: 'Man',
    image: '/community/ride.png',
    verified: true,
  },
  {
    id: 'ad-erik',
    userId: 'u-erik',
    username: 'Erik Berg',
    status: 'Man',
    age: 29,
    district: 'Nacka',
    place: 'Nacka',
    headline: 'Trail company when it is dry',
    body: 'Nacka trails after work. Happy to wait for a puncture.',
    published: '18 Sep 2026',
    lookingFor: 'Woman',
    image: '/community/hero.png',
    verified: false,
  },
]

export async function listAds(): Promise<Ad[]> {
  return seed
}
