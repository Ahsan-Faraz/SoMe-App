import 'server-only'
import { cache } from 'react'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import type { Choice, ProfileSchema } from '@/features/fields/types'
import { formatDay, formatStamp } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { CARDS_PAGE, cardLabels, toAnswers, toCard, type AnswerRows, type ProfileSearch } from './cards'
import { fromSaved, type ProfileFilter } from './filter'
import { profilePhotoUrl, toProfilePhoto, type PhotoRow } from './photo'
import type { LinkedProfile, Profile } from './types'

// What public.profile() returns (supabase/migrations/20261017120000_feedback_261016.sql).
type ProfileRow = AnswerRows & {
  user_id: string
  username: string
  own: boolean
  state: Profile['state']
  created_at: string | null
  status_id: string | null
  looking_for: string[]
  country_id: string | null
  district_id: string | null
  place: string | null
  visible_in_search: boolean
  score: number
  last_login_at: string | null
  photo: PhotoRow | null
  people: { substatus_id: string | null; n: number; birth_date: string | null; age: number | null }[]
  links: { user_id: string; username: string; icon: string | null; confirmed: boolean; comment: string | null }[]
  linked_you: { user_id: string; username: string; icon: string | null }[]
}

// One profile in one database call (A3/B1), with ids turned into labels from the cached builder.
// Null when the viewer may not see it (the database decides: applicants see only themselves).
// Cached per request: the layout, page and admin panel share one call.
export const getProfile = cache(async (slug: string, userId: string): Promise<Profile | null> => {
  const community = await getCommunity(slug)
  if (!community || !isUuid(userId)) return null

  const supabase = await createClient()
  const [{ data, error }, schema] = await Promise.all([
    supabase.rpc('profile', { p_community: community.id, p_user: userId }),
    getProfileSchema(community.id),
  ])
  if (error) throw error
  if (!data) return null
  return toProfile(data as unknown as ProfileRow, schema)
})

// A5 and A27: the first page through your saved filter, and that filter (both in one round trip).
// The phone loads the next pages itself (useCardPages).

export async function searchProfiles(slug: string): Promise<ProfileSearch | null> {
  const community = await getCommunity(slug)
  if (!community) return null

  const supabase = await createClient()
  const [cards, filter, schema] = await Promise.all([
    supabase.rpc('search_profiles', { p_community: community.id, p_limit: CARDS_PAGE }),
    supabase.rpc('search_filter', { p_community: community.id }),
    getProfileSchema(community.id),
  ])
  if (cards.error) throw cards.error
  if (filter.error) throw filter.error
  const labels = cardLabels(schema)
  return { communityId: community.id, cards: cards.data.map((row) => toCard(row, labels)), filter: fromSaved(filter.data), labels }
}

// G1: your saved filter, to edit.
export async function getSearchFilter(slug: string): Promise<ProfileFilter> {
  const community = await getCommunity(slug)
  if (!community) return fromSaved(null)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_filter', { p_community: community.id })
  if (error) throw error
  return fromSaved(data)
}

function toProfile(row: ProfileRow, schema: ProfileSchema): Profile {
  const { values, photoValues } = toAnswers(row, new Map(schema.fields.map((field) => [field.id, field.kind])))
  const link = (item: { user_id: string; username: string; icon: string | null; comment?: string | null }, confirmed: boolean): LinkedProfile => ({
    id: item.user_id,
    username: item.username,
    icon: item.icon ? profilePhotoUrl(item.icon) : null,
    confirmed,
    comment: item.comment ?? '',
  })
  const people = row.people.map((person) => ({ substatusId: person.substatus_id, n: person.n, birthDate: person.birth_date ?? '', age: person.age }))

  return {
    id: row.user_id,
    username: row.username,
    own: row.own,
    state: row.state,
    statusId: row.status_id,
    status: labelOf(schema.statuses, row.status_id),
    lookingForIds: row.looking_for,
    lookingFor: row.looking_for.map((id) => labelOf(schema.statuses, id)).filter(Boolean),
    countryId: row.country_id,
    country: labelOf(schema.countries, row.country_id),
    districtId: row.district_id,
    district: labelOf(schema.districts, row.district_id),
    place: row.place ?? '',
    people,
    ages: people.flatMap((person) => (person.age === null ? [] : [person.age])),
    visibleInSearch: row.visible_in_search,
    score: row.score,
    lastLogin: row.last_login_at ? formatStamp(row.last_login_at) : '',
    memberSince: row.created_at ? formatDay(new Date(row.created_at)) : '',
    photo: row.photo ? toProfilePhoto(row.photo) : null,
    values,
    photoValues,
    linked: row.links.map((item) => link(item, item.confirmed)),
    linkedYou: row.linked_you.map((item) => link(item, false)),
  }
}

const labelOf = (choices: readonly Choice[], id: string | null) => (id ? (choices.find((choice) => choice.id === id)?.label ?? '') : '')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (value: string) => UUID.test(value)
