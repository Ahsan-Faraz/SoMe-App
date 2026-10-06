import 'server-only'
import { mockApplicants, mockProfiles } from '@/mocks/data'
import type { BrowseProfile, LinkedProfile, Profile, ProfileCard } from './types'

const PAGE_LIMIT = 50

const ownProfile = {
  status: 'Man',
  age: 32,
  district: 'Stockholm',
  place: 'Stockholm',
  headline: 'New member',
  about: '',
  lastLogin: '23 Sep, 21:00',
  score: 50,
  lookingFor: ['Woman'],
  linked: [] as string[],
  photo: { src: '/community/hero.png', verified: true, date: '14 Sep 2026' },
}

function toCard({ id, username, status, age, district, place, headline, score, lookingFor, photo }: (typeof mockProfiles)[number]): ProfileCard {
  return { id, username, status, age, district, place, headline, score, lookingFor, photo }
}

export async function listProfiles(): Promise<ProfileCard[]> {
  return mockProfiles.slice(0, PAGE_LIMIT).map(toCard)
}

// A27: the list cards plus what the browse view shows of each profile.
export async function listBrowseProfiles(): Promise<BrowseProfile[]> {
  return mockProfiles.slice(0, PAGE_LIMIT).map((profile) => ({ ...toCard(profile), about: profile.about, lastLogin: profile.lastLogin }))
}

// Every profile the viewer can link to (A32), by name.
export async function listProfileNames(viewerId: string): Promise<LinkedProfile[]> {
  return mockProfiles.filter((profile) => profile.id !== viewerId).map(({ id, username }) => ({ id, username }))
}

// Members plus people who applied: admins open applicants' profiles from the application lists.
const everyone = [...mockProfiles, ...mockApplicants]

function linkedNames(ids: string[]): LinkedProfile[] {
  return ids.flatMap((id) => {
    const profile = everyone.find((item) => item.id === id)
    return profile ? [{ id: profile.id, username: profile.username }] : []
  })
}

export async function getProfile(userId: string, viewerId: string, viewerName: string): Promise<Profile | null> {
  if (userId === viewerId) {
    return { id: viewerId, username: viewerName, ...ownProfile, linked: linkedNames(ownProfile.linked), own: true }
  }
  const profile = everyone.find((item) => item.id === userId)
  if (!profile) return null
  return { ...toCard(profile), about: profile.about, lastLogin: profile.lastLogin, linked: linkedNames(profile.linked), own: false }
}
