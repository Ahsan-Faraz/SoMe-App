import { emptyAdFilter, type Ad, type AdFilter } from './types'

export function adsKey(community: string) {
  return `some:ads:${community}`
}

export function loadAds(community: string, seed: Ad[]): Ad[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(adsKey(community)) ?? '') as Ad[]
    return Array.isArray(parsed) ? parsed : seed
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

export function readAdFilter(community: string): AdFilter {
  try {
    const parsed = JSON.parse(localStorage.getItem(filterKey(community)) ?? '') as AdFilter
    if (!parsed || !Array.isArray(parsed.statuses)) return emptyAdFilter
    return { ...emptyAdFilter, ...parsed, statuses: parsed.statuses }
  } catch {
    return emptyAdFilter
  }
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
  return (
    filter.statuses.length +
    (filter.minAge ? 1 : 0) +
    (filter.maxAge ? 1 : 0) +
    (filter.text.trim() ? 1 : 0) +
    (filter.lookingFor ? 1 : 0) +
    (filter.district ? 1 : 0) +
    (filter.place.trim() ? 1 : 0)
  )
}

export function matches(ad: Ad, filter: AdFilter) {
  const min = filter.minAge === '' ? null : Number(filter.minAge)
  const max = filter.maxAge === '' ? null : Number(filter.maxAge)
  if (filter.statuses.length > 0 && !filter.statuses.includes(ad.status)) return false
  if (min !== null && ad.age < min) return false
  if (max !== null && ad.age > max) return false
  if (filter.lookingFor && ad.lookingFor !== filter.lookingFor) return false
  if (filter.district && ad.district !== filter.district) return false
  if (filter.place && !ad.place.toLowerCase().includes(filter.place.trim().toLowerCase())) return false
  if (filter.text.trim()) {
    const hay = `${ad.headline} ${ad.body} ${ad.username} ${ad.place}`.toLowerCase()
    if (!hay.includes(filter.text.trim().toLowerCase())) return false
  }
  return true
}
