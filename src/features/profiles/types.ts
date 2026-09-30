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
  photo: MainPhoto | null
}

export type Profile = ProfileCard & {
  about: string
  lastLogin: string
  // Display only for now: how score and reputation are calculated is not decided (spec lists both as Later).
  score: number // 0–100
  reputation: number // -10–10
  own: boolean
}
