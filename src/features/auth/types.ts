export type Role = 'member' | 'admin' | 'pending'

export type Viewer = {
  userId: string
  username: string
  role: Role
  canCreateGroups: boolean // D9: members the community admin gave group-create rights
}
