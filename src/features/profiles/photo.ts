export function photoKey(community: string, userId: string) {
  return `some:photo:${community}:${userId}`
}

export type StoredPhoto = { src: string; date: string; verified: boolean }

export function readPhoto(community: string, userId: string): StoredPhoto | null {
  const raw = localStorage.getItem(photoKey(community, userId))
  if (!raw) return null
  if (raw.startsWith('data:') || raw.startsWith('/')) return { src: raw, date: '', verified: true }
  try {
    const parsed = JSON.parse(raw) as StoredPhoto
    if (parsed?.src) return { src: parsed.src, date: parsed.date ?? '', verified: parsed.verified !== false }
  } catch {
    return null
  }
  return null
}

// verified = taken with the in-app camera (camera + date only; it can still be faked).
export function writePhoto(community: string, userId: string, src: string, verified: boolean) {
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
  localStorage.setItem(photoKey(community, userId), JSON.stringify({ src, date, verified } satisfies StoredPhoto))
  window.dispatchEvent(new Event('some-photo'))
}
