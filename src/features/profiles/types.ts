// Profile image nr 1. verified = taken with the in-app camera (camera + date only).
export type MainPhoto = { src: string; verified: boolean; date: string }

export type ProfileCard = {
  id: string
  username: string
  status: string
  age: number
  district: string
  place: string
  headline: string
  // Display only for now: how the score is calculated is not decided (spec lists it as Later).
  score: number // 0–100
  lookingFor: string[]
  photo: MainPhoto | null
}

export type BrowseProfile = ProfileCard & { about: string; lastLogin: string }

export type LinkedProfile = { id: string; username: string }

export type Profile = ProfileCard & {
  about: string
  lastLogin: string
  linked: LinkedProfile[]
  own: boolean
}
