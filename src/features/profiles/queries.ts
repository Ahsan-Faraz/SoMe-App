import 'server-only'
import { mockProfiles } from '@/mocks/data'
import type { Profile, ProfileCard } from './types'

const PAGE_LIMIT = 50

const ownProfile = {
  status: 'Man',
  age: 32,
  district: 'Stockholm',
  place: 'Stockholm',
  headline: 'New member',
  about: '',
  lastLogin: '23 Sep, 21:00',
}

export async function listProfiles(): Promise<ProfileCard[]> {
  return mockProfiles.slice(0, PAGE_LIMIT).map(({ id, username, status, age, district, place, headline }) => ({
    id,
    username,
    status,
    age,
    district,
    place,
    headline,
  }))
}

export async function getProfile(userId: string, viewerId: string, viewerName: string): Promise<Profile | null> {
  if (userId === viewerId) {
    return { id: viewerId, username: viewerName, ...ownProfile, own: true }
  }
  const profile = mockProfiles.find((item) => item.id === userId)
  if (!profile) return null
  return { ...profile, own: false }
}
