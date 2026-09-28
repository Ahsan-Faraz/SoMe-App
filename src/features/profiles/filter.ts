export type ProfileFilter = { text: string; picked: string[]; minAge: string; maxAge: string }

export const emptyFilter: ProfileFilter = { text: '', picked: [], minAge: '', maxAge: '' }

function key(community: string) {
  return `some:filter:${community}`
}

export function readFilter(community: string): ProfileFilter {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(community)) ?? '') as ProfileFilter
    if (!parsed || !Array.isArray(parsed.picked)) return emptyFilter
    return { text: parsed.text ?? '', picked: parsed.picked, minAge: parsed.minAge ?? '', maxAge: parsed.maxAge ?? '' }
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
  return filter.picked.length + (filter.minAge ? 1 : 0) + (filter.maxAge ? 1 : 0) + (filter.text.trim() ? 1 : 0)
}
