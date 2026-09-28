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
  lookingFor: string
  image: string
  verified: boolean
}

export type AdFilter = {
  text: string
  statuses: string[]
  minAge: string
  maxAge: string
  lookingFor: string
  district: string
  place: string
}

export const emptyAdFilter: AdFilter = { text: '', statuses: [], minAge: '', maxAge: '', lookingFor: '', district: '', place: '' }
