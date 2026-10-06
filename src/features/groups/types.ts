export type GroupForm = {
  id: string
  name: string
  headline: string
  // Shown at the top of the group application form (A24).
  applicationText: string
  // The 3 "profile state" labels an admin keeps per member, e.g. Application status, Paid amount.
  stateLabels: string[]
  visibleInSearch: boolean
  // What an application must include when direct join is off.
  applyImage: boolean
  applyText: boolean
  applyNames: boolean
  calendar: boolean
  history: boolean
  memberList: boolean
  editPosts: boolean
  directJoin: boolean
  posting: boolean
  commenting: boolean
  reactions: boolean
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

export type GroupFlag = { [K in keyof GroupForm]: GroupForm[K] extends boolean ? K : never }[keyof GroupForm]
