export function photoKey(community: string, userId: string) {
  return `some:photo:${community}:${userId}`
}

export type StoredPhoto = { src: string; date: string }

export function readPhoto(community: string, userId: string): StoredPhoto | null {
  const raw = localStorage.getItem(photoKey(community, userId))
  if (!raw) return null
  if (raw.startsWith('data:') || raw.startsWith('/')) return { src: raw, date: '' }
  try {
    const parsed = JSON.parse(raw) as StoredPhoto
    if (parsed?.src) return { src: parsed.src, date: parsed.date ?? '' }
  } catch {
    return null
  }
  return null
}

export function writePhoto(community: string, userId: string, src: string) {
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
  localStorage.setItem(photoKey(community, userId), JSON.stringify({ src, date }))
  window.dispatchEvent(new Event('some-photo'))
}
