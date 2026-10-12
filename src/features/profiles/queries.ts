import 'server-only'
import { mockApplicants, mockLinksToViewer, mockProfiles } from '@/mocks/data'
import type { BrowseProfile, LinkedProfile, Profile, ProfileCard } from './types'

const PAGE_LIMIT = 50

// Your own profile starts new: no status yet. You pick it once on your profile (then it is locked).
const ownProfile = {
  status: '',
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

// What others see: only confirmed links, where the other profile has linked back.
// An unconfirmed link is not shown at all, not even dimmed.
function confirmedLinks(profile: (typeof everyone)[number]): LinkedProfile[] {
  return linkedNames(profile.linked.filter((id) => everyone.find((item) => item.id === id)?.linked.includes(profile.id)))
}

export async function getProfile(userId: string, viewerId: string, viewerName: string): Promise<Profile | null> {
  if (userId === viewerId) {
    // Your own: every link you made (dimmed until confirmed) and who has linked to you.
    return { id: viewerId, username: viewerName, ...ownProfile, linked: linkedNames(ownProfile.linked), linkedYou: mockLinksToViewer, own: true }
  }
  const profile = everyone.find((item) => item.id === userId)
  if (!profile) return null
  return { ...toCard(profile), about: profile.about, lastLogin: profile.lastLogin, linked: confirmedLinks(profile), linkedYou: [], own: false }
}
