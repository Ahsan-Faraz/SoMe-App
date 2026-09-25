export type GroupForm = {
  id: string
  name: string
  headline: string
  calendar: boolean
  history: boolean
  memberList: boolean
  editPosts: boolean
  directJoin: boolean
}

export type GroupMember = { id: string; username: string }

export type GroupInfo = {
  id: string
  name: string
  headline: string
  members: GroupMember[] | null
  infoHeadlines: string[]
}

export type InfoPost = { groupName: string; n: number; headline: string; body: string }
