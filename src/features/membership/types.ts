// Membership = a person's place in a scope: the community (A20/A21/A31/A33) or one group (A22/A23/A28/A30).
// Everything here is kept separately per scope: the same person has different notes in each group.

export type ScopeKind = 'community' | 'group'

export type Requirements = { image: boolean; text: boolean; names: boolean }

export type Scope = {
  kind: ScopeKind
  id: string // 'community' or the group id
  name: string
  stateLabels: string[] // 3 labels; '' = that profile-state field is not used
  applicationText: string
  requires: Requirements
}

export type ApplicationImage = { src: string; verified: boolean; date: string }

export type MemberRecord = {
  userId: string
  username: string
  status: string
  realNames: string[] // [name 1, name 2]
  state: string[] // 3 whole numbers as text; '' = not set
  notes: string
  image: ApplicationImage | null
  message: string
  applied: boolean // in the applications list, not a member yet
}

export type Roster = { members: MemberRecord[]; applications: MemberRecord[] }

// What an admin changed on this device, by user id, until the memberships table exists.
export type RosterEdit = { realNames?: string[]; state?: string[]; notes?: string; approved?: boolean; removed?: boolean }

export const REAL_NAMES = 2
export const STATE_FIELDS = 3

export function scopeKey(scope: Pick<Scope, 'kind' | 'id'>) {
  return scope.kind === 'community' ? 'community' : `group:${scope.id}`
}
