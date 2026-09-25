export type ProfileCard = {
  id: string
  username: string
  status: string
  age: number
  district: string
  place: string
  headline: string
}

export type Profile = ProfileCard & {
  about: string
  lastLogin: string
  own: boolean
}
