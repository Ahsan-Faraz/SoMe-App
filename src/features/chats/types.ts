// What the viewer may do in this chat: group settings, but admins can always do everything.
export type ChatRules = { post: boolean; comment: boolean; react: boolean; edit: boolean }

export type Reaction = { emoji: string; count: number; mine: boolean }

export type ChatMessage = {
  id: string
  author: string
  authorId: string | null
  mine: boolean
  body: string
  timeLabel: string
  reactions: Reaction[]
  comment: string | null
  image: boolean
  imageSrc: string | null
  verified: boolean
  verifiedDate: string | null
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
