import type { FieldValue } from './fields'

// A photo as screens show it. verified = Taken in app (in-app camera + date only; it can still be faked).
// date: when it was taken (Taken in app) or added (uploaded).
export type MainPhoto = { src: string; verified: boolean; date: string }

// A profile photo stored in the profile bucket. src = full size, thumb = about 256 px (icons, lists).
// width/height of the full image (null for mock photos) reserve its space before it loads.
export type ProfilePhoto = MainPhoto & { id: string; thumb: string; width?: number | null; height?: number | null }

export type ProfileCard = {
  id: string
  username: string
  status: string // label; '' = not chosen yet (a new profile)
  ages: number[] // one per person with a birth date, in the Status's order
  country: string
  district: string
  place: string
  score: number // 0–100, computed by the database on save
  lookingFor: string[] // Status labels
  photo: MainPhoto | null // the profile image (thumbnail)
}

// A27: values stay empty until search_profiles returns answers (backend step 9).
export type BrowseProfile = ProfileCard & { lastLogin: string; values: Record<string, FieldValue> }

// icon = thumbnail URL. confirmed = both have linked to each other (D23). comment: the profile
// owner's short note on the link ('' = none).
export type LinkedProfile = { id: string; username: string; icon: string | null; confirmed: boolean; comment: string }

// One person of the profile's Status. birthDate ('YYYY-MM-DD' or '') only on your own profile.
export type ProfilePerson = { substatusId: string | null; n: number; birthDate: string; age: number | null }

export type Profile = Omit<ProfileCard, 'photo'> & {
  own: boolean
  state: 'profile' | 'applied' | 'approved' | 'rejected' | 'removed'
  statusId: string | null
  lookingForIds: string[]
  countryId: string | null
  districtId: string | null
  people: ProfilePerson[]
  visibleInSearch: boolean
  lastLogin: string // formatted; '' = never
  memberSince: string // formatted account creation date; yourself and the community admin only, else ''
  photo: ProfilePhoto | null // the profile image: icon and search card
  // Answers to the fields of this Status, keyed by valueKey(field, person).
  values: Record<string, FieldValue>
  photoValues: Record<string, ProfilePhoto>
  // Own profile: every link you made. Someone else's: only confirmed links.
  linked: LinkedProfile[]
  // Own profile only: who has linked to you.
  linkedYou: LinkedProfile[]
}
