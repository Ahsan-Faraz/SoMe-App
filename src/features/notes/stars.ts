// My stars = the score in my private notes about a profile (B5). This device only until the notes table exists.
export function profileNotesKey(community: string, viewerId: string, userId: string) {
  return `some:notes:${community}:${viewerId}:profile:${userId}`
}

// One read per list render: every profile's stars by user id (0 = not rated).
export function readStars(community: string, viewerId: string, userIds: string[]): Record<string, number> {
  const stars: Record<string, number> = {}
  for (const id of userIds) {
    try {
      const saved = JSON.parse(localStorage.getItem(profileNotesKey(community, viewerId, id)) ?? 'null') as { score?: number } | null
      stars[id] = typeof saved?.score === 'number' ? saved.score : 0
    } catch {
      stars[id] = 0
    }
  }
  return stars
}

// Set my stars for a profile (A27 rating), keeping the note text.
export function writeStars(community: string, viewerId: string, userId: string, score: number) {
  const key = profileNotesKey(community, viewerId, userId)
  let text = ''
  try {
    text = (JSON.parse(localStorage.getItem(key) ?? 'null') as { text?: string } | null)?.text ?? ''
  } catch {
    // Unreadable note: start a fresh one.
  }
  localStorage.setItem(key, JSON.stringify({ text, score }))
}
