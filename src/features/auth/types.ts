export type Role = 'member' | 'admin' | 'pending'

export type Viewer = {
  userId: string
  username: string
  role: Role
}
