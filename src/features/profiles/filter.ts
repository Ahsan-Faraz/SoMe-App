import type { ProfileCard } from './types'

// G1. Number fields are strings: '' = no limit. Reputation min comes later.
export type ProfileFilter = {
  text: string
  picked: string[] // status
  lookingFor: string[]
  districts: string[]
  place: string
  minAge: string
  maxAge: string
  minScore: string
  minStars: string
  maxStars: string
}

export const emptyFilter: ProfileFilter = {
  text: '',
  picked: [],
  lookingFor: [],
  districts: [],
  place: '',
  minAge: '',
  maxAge: '',
  minScore: '',
  minStars: '',
  maxStars: '',
}

function key(community: string) {
  return `some:filter:${community}`
}

const lists = ['picked', 'lookingFor', 'districts'] as const
const texts = ['text', 'place', 'minAge', 'maxAge', 'minScore', 'minStars', 'maxStars'] as const

// Saved filters from older versions miss the newer fields: fill them in, drop anything malformed.
export function readFilter(community: string): ProfileFilter {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(community)) ?? '') as Partial<ProfileFilter> | null
    if (!parsed || typeof parsed !== 'object') return emptyFilter
    const filter = { ...emptyFilter }
    for (const name of lists) if (Array.isArray(parsed[name])) filter[name] = parsed[name].filter((item) => typeof item === 'string')
    for (const name of texts) if (typeof parsed[name] === 'string') filter[name] = parsed[name]
    return filter
  } catch {
    return emptyFilter
  }
}

export function writeFilter(community: string, filter: ProfileFilter) {
  localStorage.setItem(key(community), JSON.stringify(filter))
  window.dispatchEvent(new Event('some-filter'))
}

export function watchFilter(community: string, onChange: (filter: ProfileFilter) => void) {
  const read = () => onChange(readFilter(community))
  read()
  window.addEventListener('some-filter', read)
  return () => window.removeEventListener('some-filter', read)
}

export function filterCount(filter: ProfileFilter) {
  return lists.reduce((sum, name) => sum + filter[name].length, 0) + texts.filter((name) => filter[name].trim() !== '').length
}

function limit(value: string) {
  return value === '' ? null : Number(value)
}

// stars = my private-notes score for this profile (0 = not rated yet).
export function matchesProfile(profile: ProfileCard, stars: number, filter: ProfileFilter, query: string) {
  const minAge = limit(filter.minAge)
  const maxAge = limit(filter.maxAge)
  const minScore = limit(filter.minScore)
  const minStars = limit(filter.minStars)
  const maxStars = limit(filter.maxStars)
  const place = filter.place.trim().toLowerCase()
  if (filter.picked.length > 0 && !filter.picked.includes(profile.status)) return false
  if (filter.lookingFor.length > 0 && !profile.lookingFor.some((item) => filter.lookingFor.includes(item))) return false
  if (filter.districts.length > 0 && !filter.districts.includes(profile.district)) return false
  if (place && !profile.place.toLowerCase().includes(place)) return false
  if (minAge !== null && profile.age < minAge) return false
  if (maxAge !== null && profile.age > maxAge) return false
  if (minScore !== null && profile.score < minScore) return false
  if (minStars !== null && stars < minStars) return false
  if (maxStars !== null && stars > maxStars) return false
  if (!query) return true
  return `${profile.username} ${profile.headline} ${profile.district} ${profile.place}`.toLowerCase().includes(query)
}
