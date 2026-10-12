export type Ad = {
  id: string
  userId: string
  username: string
  status: string
  age: number
  district: string
  place: string
  headline: string
  body: string
  published: string
  // One or more statuses (multi select).
  lookingFor: string[]
  image: string
  verified: boolean
}

// D1. Number fields are strings: '' = no limit. Reputation min comes later.
export type AdFilter = {
  text: string
  statuses: string[]
  minAge: string
  maxAge: string
  lookingFor: string[]
  district: string
  place: string
  minScore: string
  minStars: string
  maxStars: string
}

export const emptyAdFilter: AdFilter = {
  text: '',
  statuses: [],
  minAge: '',
  maxAge: '',
  lookingFor: [],
  district: '',
  place: '',
  minScore: '',
  minStars: '',
  maxStars: '',
}
