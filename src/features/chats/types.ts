export type ChatMessage = {
  id: string
  author: string
  authorId: string | null
  mine: boolean
  body: string
  timeLabel: string
  reactions: string | null
  comment: string | null
  image: boolean
}

export type ChatPanel = 'calendar' | 'info1' | 'info2' | 'info3'

export type ChatThread = {
  id: string
  kind: 'dm' | 'group'
  name: string
  messages: ChatMessage[]
}

export type DirectoryEntry = {
  id: string
  kind: 'user' | 'group'
  name: string
  detail: string
  href: string
}

export type ChatListItem = {
  id: string
  kind: 'dm' | 'group'
  name: string
  lastMessage: string | null
  lastMessageAt: string
  unread: number
}
