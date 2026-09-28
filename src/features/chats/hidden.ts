type Hidden = { left: string[]; blocked: string[] }

const empty: Hidden = { left: [], blocked: [] }

function key(community: string) {
  return `some:chats:${community}`
}

export function readHidden(community: string): Hidden {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(community)) ?? '') as Hidden
    if (!parsed || !Array.isArray(parsed.left) || !Array.isArray(parsed.blocked)) return empty
    return parsed
  } catch {
    return empty
  }
}

export function leaveChat(community: string, chatId: string, block: boolean) {
  const current = readHidden(community)
  const left = current.left.includes(chatId) ? current.left : [...current.left, chatId]
  const blocked = block && !current.blocked.includes(chatId) ? [...current.blocked, chatId] : current.blocked
  localStorage.setItem(key(community), JSON.stringify({ left, blocked }))
  window.dispatchEvent(new Event('some-chats'))
}

export function watchHidden(community: string, onChange: (hidden: Hidden) => void) {
  const read = () => onChange(readHidden(community))
  read()
  window.addEventListener('some-chats', read)
  return () => window.removeEventListener('some-chats', read)
}
