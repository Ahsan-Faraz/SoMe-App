// A6/D2/D3 (supabase/migrations/20261030120000_ads.sql). The author's age, Status and score are read
// from their profile on every read, never kept on the ad. Ad images are in the private bucket: the
// server signs them right after the database said the viewer may see the ad.

// An ad in a list (search_ads, member_ads). image: a signed thumbnail link.
export type AdCard = {
  id: string
  userId: string
  username: string
  status: string
  ages: number[]
  district: string
  place: string
  headline: string
  published: string
  publishedAt: string // the keyset for the next page
  image: string | null
  verified: boolean
}

// One ad (ad_view). image: a signed link to the full image.
export type AdDetail = {
  id: string
  userId: string
  own: boolean
  username: string
  status: string
  ages: number[]
  lookingForIds: string[]
  lookingFor: string[]
  headline: string
  body: string
  districtId: string | null
  district: string
  place: string
  published: string
  image: string | null
  verified: boolean
}

// One page of the Ads tab.
export const ADS_PAGE = 30

// The Ads tab as the server starts it: the first page through the saved filter, and that filter.
export type AdSearch = { communityId: string; cards: AdCard[]; filter: AdFilter }

// D1, saved on the account (members.ad_filter). Choices are ids; number fields are strings while
// typed: '' = no limit. Reputation min comes later.
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
