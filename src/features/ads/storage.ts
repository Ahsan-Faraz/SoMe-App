import { emptyAdFilter, type Ad, type AdFilter } from './types'

export function adsKey(community: string) {
  return `some:ads:${community}`
}

// Ads saved on this device before Looking for became a multi select had a single string.
export function loadAds(community: string, seed: Ad[]): Ad[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(adsKey(community)) ?? '') as (Omit<Ad, 'lookingFor'> & { lookingFor: string | string[] })[]
    if (!Array.isArray(parsed)) return seed
    return parsed.map((ad) => ({ ...ad, lookingFor: typeof ad.lookingFor === 'string' ? [ad.lookingFor] : strings(ad.lookingFor) }))
  } catch {
    return seed
  }
}

export function saveAds(community: string, ads: Ad[]) {
  localStorage.setItem(adsKey(community), JSON.stringify(ads))
  window.dispatchEvent(new Event('some-ads'))
}

function filterKey(community: string) {
  return `some:ads-filter:${community}`
}

const textKeys = ['text', 'minAge', 'maxAge', 'district', 'place', 'minScore', 'minStars', 'maxStars'] as const

// Older saved filters had a single lookingFor string: carry it over, fill in newer fields.
export function readAdFilter(community: string): AdFilter {
  try {
    const parsed = JSON.parse(localStorage.getItem(filterKey(community)) ?? '') as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return emptyAdFilter
    const filter: AdFilter = { ...emptyAdFilter, statuses: strings(parsed.statuses), lookingFor: typeof parsed.lookingFor === 'string' && parsed.lookingFor ? [parsed.lookingFor] : strings(parsed.lookingFor) }
    for (const name of textKeys) if (typeof parsed[name] === 'string') filter[name] = parsed[name]
    return filter
  } catch {
    return emptyAdFilter
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function writeAdFilter(community: string, filter: AdFilter) {
  localStorage.setItem(filterKey(community), JSON.stringify(filter))
  window.dispatchEvent(new Event('some-ads-filter'))
}

export function watchAdFilter(community: string, onChange: (filter: AdFilter) => void) {
  const read = () => onChange(readAdFilter(community))
  read()
  window.addEventListener('some-ads-filter', read)
  return () => window.removeEventListener('some-ads-filter', read)
}

export function adFilterCount(filter: AdFilter) {
  return filter.statuses.length + filter.lookingFor.length + textKeys.filter((name) => filter[name].trim() !== '').length
}

function limit(value: string) {
  return value === '' ? null : Number(value)
}

// score = the author's profile score; stars = my private-notes score for the author (0 = not rated).
export function matches(ad: Ad, filter: AdFilter, score: number, stars: number) {
  const minAge = limit(filter.minAge)
  const maxAge = limit(filter.maxAge)
  const minScore = limit(filter.minScore)
  const minStars = limit(filter.minStars)
  const maxStars = limit(filter.maxStars)
  const place = filter.place.trim().toLowerCase()
  const text = filter.text.trim().toLowerCase()
  if (filter.statuses.length > 0 && !filter.statuses.includes(ad.status)) return false
  if (minAge !== null && ad.age < minAge) return false
  if (maxAge !== null && ad.age > maxAge) return false
  if (filter.lookingFor.length > 0 && !ad.lookingFor.some((item) => filter.lookingFor.includes(item))) return false
  if (filter.district && ad.district !== filter.district) return false
  if (place && !ad.place.toLowerCase().includes(place)) return false
  if (minScore !== null && score < minScore) return false
  if (minStars !== null && stars < minStars) return false
  if (maxStars !== null && stars > maxStars) return false
  return !text || `${ad.headline} ${ad.body} ${ad.username} ${ad.place}`.toLowerCase().includes(text)
}
