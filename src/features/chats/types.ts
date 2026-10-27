// What the viewer may do in this chat: group settings, but admins can always do everything.
// From the chat header (the group's switches); the database checks every action again.
export type ChatRules = { post: boolean; comment: boolean; react: boolean; edit: boolean; remove: boolean; images: boolean }

export type Reaction = { emoji: string; count: number; mine: boolean }

// sending: on screen, not confirmed by the database yet. failed: not saved; tap to send it again
// (the same clientId, so it is never saved twice).
export type SendState = 'sent' | 'sending' | 'failed'

export type ChatMessage = {
  id: string // `${seq}` once saved; `c:${clientId}` while sending
  seq: number | null // the message's number in its chat; null until the database has saved it
  clientId: string | null // made on the phone when sending
  author: string
  authorId: string | null
  // Group posts show the author's status, e.g. "Kitty553 (Woman)". Null in DMs and on your own posts.
  authorStatus: string | null
  mine: boolean
  system: boolean // from the No-reply account: nothing to react to or answer
  body: string
  createdAt: string // ISO; shown as "28 Sept, 21:09"
  state: SendState
  reactions: Reaction[]
  edited: boolean
  // A comment on another post: shown as a dimmed snippet of that post above the comment text.
  replyTo: { seq: number; author: string; body: string } | null
  image: boolean
  // The photo in the private bucket (signed links only). thumb/full: signed URLs once signed (or the
  // picked image while sending); width/height keep its shape while it loads.
  photo: { path: string; thumbPath: string; width: number | null; height: number | null } | null
  imageSrc: string | null
  verified: boolean
  verifiedDate: string | null
}

export type ChatPanel = 'calendar' | 'info1' | 'info2' | 'info3'

// A4 header: the chat as the viewer sees it. otherUserId: a DM's other person. blocked: a DM where
// one of the two has blocked the other ("Keep chat, block writing"): read only for both.
// manage: a group the viewer runs (group admin or community admin). canPost and allow: what the
// group lets the viewer do (admins may always). calendar and infoHeadline: the group's info bar.
export type ChatHeader = {
  id: string
  kind: 'dm' | 'group'
  name: string
  otherUserId: string | null
  lastSeq: number
  blocked: boolean
  manage: boolean
  canPost: boolean
  allow: { comment: boolean; react: boolean; edit: boolean }
  calendar: boolean
  infoHeadline: string | null
}

// A4: the header and the newest page of messages, oldest first.
export type ChatPage = ChatHeader & { messages: ChatMessage[]; hasOlder: boolean }

export type DirectoryEntry = {
  id: string
  kind: 'user' | 'group'
  name: string
  detail: string
  icon: string | null // a person's profile image (thumbnail)
  href: string
}

export type ChatListItem = {
  id: string
  kind: 'dm' | 'group'
  name: string
  icon: string | null // a DM's: the other person's profile image (thumbnail)
  lastMessage: string | null
  lastMessageAt: string
  unread: number
}
