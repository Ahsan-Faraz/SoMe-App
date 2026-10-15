import 'server-only'
import { cache } from 'react'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { personKey } from '@/features/fields/schema'
import type { Choice, ProfileSchema } from '@/features/fields/types'
import { formatDay, formatStamp } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { mockProfiles } from '@/mocks/data'
import { valueKey, type FieldValue } from './fields'
import { profilePhotoUrl, toProfilePhoto, type PhotoRow } from './photo'
import type { BrowseProfile, LinkedProfile, Profile, ProfileCard, ProfilePhoto } from './types'

// The first page of the Profiles list. Paging and filters run in the database with search_profiles
// (backend step 9); until then the list filters this page on the phone.
const CARDS_LIMIT = 50

// What public.profile() returns (supabase/migrations/20261014120000_profile_sections.sql).
type Person = { substatus_id: string | null; n: number }
type ProfileRow = {
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
  people: (Person & { birth_date: string | null; age: number | null })[]
  values: (Person & { field_id: string; text: string | null; num: number | null; bool: boolean | null; date: string | null; photo: PhotoRow | null })[]
  choices: (Person & { field_id: string; option_ids: string[] })[]
  links: { user_id: string; username: string; icon: string | null; confirmed: boolean }[]
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

// A5 cards: approved members visible in search, best score first.
export async function listProfiles(slug: string): Promise<ProfileCard[]> {
  const community = await getCommunity(slug)
  if (!community) return []

  const supabase = await createClient()
  const [{ data, error }, schema] = await Promise.all([
    supabase.rpc('profile_cards', { p_community: community.id, p_limit: CARDS_LIMIT }),
    getProfileSchema(community.id),
  ])
  if (error) throw error

  return data.map((row) => ({
    id: row.user_id,
    username: row.username,
    status: labelOf(schema.statuses, row.status_id),
    ages: row.ages,
    country: labelOf(schema.countries, row.country_id),
    district: labelOf(schema.districts, row.district_id),
    place: row.place ?? '',
    score: row.score,
    lookingFor: row.looking_for.map((id) => labelOf(schema.statuses, id)).filter(Boolean),
    photo: row.photo_thumb ? { src: profilePhotoUrl(row.photo_thumb), verified: Boolean(row.photo_taken_in_app), date: '' } : null,
  }))
}

function toProfile(row: ProfileRow, schema: ProfileSchema): Profile {
  const kinds = new Map(schema.fields.map((field) => [field.id, field.kind]))
  const keyOf = (item: Person & { field_id: string }) => valueKey(item.field_id, personKey(item.substatus_id, item.n))
  const values: Record<string, FieldValue> = {}
  const photoValues: Record<string, ProfilePhoto> = {}
  for (const value of row.values) {
    const key = keyOf(value)
    if (value.photo) photoValues[key] = toProfilePhoto(value.photo)
    else if (value.text !== null) values[key] = value.text
    else if (value.num !== null) values[key] = String(value.num)
    else if (value.bool !== null) values[key] = value.bool
    else if (value.date !== null) values[key] = value.date
  }
  for (const choice of row.choices) {
    values[keyOf(choice)] = kinds.get(choice.field_id) === 'pick_one' ? (choice.option_ids[0] ?? '') : choice.option_ids
  }
  const link = (item: { user_id: string; username: string; icon: string | null }, confirmed: boolean): LinkedProfile => ({
    id: item.user_id,
    username: item.username,
    icon: item.icon ? profilePhotoUrl(item.icon) : null,
    confirmed,
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

// A27 swipe: mock profiles until search_profiles arrives (backend step 9). Their about and headline
// texts stand in as answers to the community's matching fields.
export async function listBrowseProfiles(communityId: string): Promise<BrowseProfile[]> {
  const schema = await getProfileSchema(communityId)
  return mockProfiles.slice(0, CARDS_LIMIT).map(({ id, username, status, age, district, place, score, lookingFor, photo, about, headline, lastLogin }) => {
    const values: Record<string, FieldValue> = {}
    for (const field of schema.fields) {
      if (field.key === 'about' || field.key === 'about_us') values[field.id] = about
      if (field.key === 'headline') values[field.id] = headline
    }
    return { id, username, status, ages: [age], country: '', district, place, score, lookingFor, photo, lastLogin, values }
  })
}
