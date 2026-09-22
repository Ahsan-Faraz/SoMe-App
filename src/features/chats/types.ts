export type ChatListItem = {
  id: string
  kind: 'dm' | 'group'
  name: string
  lastMessage: string | null
  lastMessageAt: string
  unread: number
}
