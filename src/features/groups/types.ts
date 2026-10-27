// A10: a group's settings as the edit form holds them (the group admin or the community admin).
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

export type InfoPost = { n: number; headline: string; body: string }

export type GroupMember = { id: string; username: string; icon: string | null; admin: boolean }

// G3 / B2: what a group's members (and its admins) see. members and memberCount: null when the
// group hides its member list (its admins still get it).
export type GroupInfo = {
  id: string
  name: string
  headline: string
  infos: InfoPost[]
  members: GroupMember[] | null
  memberCount: number | null
  member: boolean // the viewer is in the group
  admin: boolean // the viewer is its group admin
  manage: boolean // the viewer runs it (group admin or community admin)
}

// A24 / A2: a group seen from outside.
export type GroupCard = {
  id: string
  name: string
  headline: string
  applicationText: string
  directJoin: boolean
  requires: { image: boolean; text: boolean; names: boolean }
  member: boolean
  applied: boolean
}

// F1 "Add to groups" for one member.
export type GroupAssignments = {
  canCreateGroups: boolean | null // shown to the community admin only
  groups: { id: string; name: string; member: boolean; admin: boolean }[] // admin: this member runs the group
}

export type GroupFlag = { [K in keyof GroupForm]: GroupForm[K] extends boolean ? K : never }[keyof GroupForm]
