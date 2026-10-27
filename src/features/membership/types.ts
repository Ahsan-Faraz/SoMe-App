// Membership = a person's place in a scope: the community (A20/A21/A31/A33) or one group (A22/A23/A28/A30).
// Everything here is kept separately per scope: the same person has different notes in each group.

export type ScopeKind = 'community' | 'group'

// identity: an ID photo with the application, checked by hand (D31; communities only).
export type Requirements = { image: boolean; text: boolean; names: boolean; identity: boolean }

export type Scope = {
  kind: ScopeKind
  id: string // 'community' or the group id
  name: string
  stateLabels: string[] // 3 labels; '' = that profile-state field is not used
  applicationText: string
  requires: Requirements
}

export type ApplicationImage = { src: string; verified: boolean; date: string }

// A25 after applying: what the applicant sent, shown back to them.
export type SentApplication = { image: ApplicationImage | null; idImage: ApplicationImage | null; message: string; realNames: string[] }

export type MemberRecord = {
  userId: string
  username: string
  status: string
  realNames: string[] // [name 1, name 2]
  state: string[] // 3 whole numbers as text; '' = not set
  notes: string
  image: ApplicationImage | null
  idImage: ApplicationImage | null // identity check (D31)
  // The images were deleted once the application was decided: when, and by whom ("Checked and deleted").
  checked: { date: string; by: string } | null
  message: string
  applied: boolean // in the applications list, not a member yet
  applicationId: string | null // the open application (community or group), for Approve
  appliedAt: string | null // when it was sent: the applications list's page key
}

// The list screen's two lists: members (A30/A31) or open applications (A20/A23).
export type RosterMode = 'members' | 'applications'

// A28/A33, counted in the database (scope_stats). byStatus: [Status name, count], most first.
// sums: the 3 profile-state numbers added up over the scope's records.
export type ScopeStats = { members: number; byStatus: [string, number][]; sums: number[] }

// One change an admin makes to a member (saveMember): record fields, Approve, or Remove.
export type RosterEdit = { realNames?: string[]; state?: string[]; notes?: string; approved?: boolean; removed?: boolean }

export const REAL_NAMES = 2
export const STATE_FIELDS = 3

