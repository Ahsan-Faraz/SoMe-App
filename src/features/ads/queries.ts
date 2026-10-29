import 'server-only'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import type { ProfileSchema } from '@/features/fields/types'
import { formatDay } from '@/lib/format'
import { isRecord, isUuid } from '@/lib/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import { fromSavedAdFilter } from './filter'
import { ADS_PAGE, type AdCard, type AdDetail, type AdFilter, type AdSearch } from './types'

// The Ads tab (search_ads), a member's ads (member_ads) and one ad (ad_view). Each RPC checks the
// caller (approved, no block either way; the Ads tab also leaves out members hidden from search),
// then the server signs the returned images in one call with the service role. No Storage policy lets
// other members read ad files, so Storage does not check each file again (scripts/speed/16_ads.sql).

// As long as the album and chat links: a page is read well within it.
const SIGNED_URL_SECONDS = 60 * 60

type CardRow = Database['public']['Functions']['search_ads']['Returns'][number]
type Labels = Record<string, string>

// Only ever with paths an ad RPC has just returned for the caller.
async function signAdPaths(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return new Map()
  const { data, error } = await createAdminClient().storage.from('private').createSignedUrls(unique, SIGNED_URL_SECONDS)
  if (error) throw error
  return new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])))
}

const labelsOf = (schema: ProfileSchema): Labels => Object.fromEntries([...schema.statuses, ...schema.districts].map((choice) => [choice.id, choice.label]))
const label = (labels: Labels, id: string | null) => (id ? (labels[id] ?? '') : '')

// Rows of search_ads or member_ads as cards, their thumbnails signed (one call).
async function toCards(rows: CardRow[], labels: Labels): Promise<AdCard[]> {
  const urls = await signAdPaths(rows.flatMap((row) => (row.photo_thumb ? [row.photo_thumb] : [])))
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    status: label(labels, row.status_id),
    ages: row.ages ?? [],
    district: label(labels, row.district_id),
    place: row.place ?? '',
    headline: row.headline,
    published: formatDay(new Date(row.published_at)),
    publishedAt: row.published_at,
    image: row.photo_thumb ? (urls.get(row.photo_thumb) ?? null) : null,
    verified: Boolean(row.photo_thumb && row.photo_taken_in_app),
  }))
}

// A page of the Ads tab through the saved filter: the first one, or the one after `after`.
export async function adPage(communityId: string, after: { publishedAt: string; id: string } | null): Promise<AdCard[]> {
  const supabase = await createClient()
  const [{ data, error }, schema] = await Promise.all([
    supabase.rpc('search_ads', { p_community: communityId, p_limit: ADS_PAGE, ...(after ? { p_after_published: after.publishedAt, p_after_id: after.id } : {}) }),
    getProfileSchema(communityId),
  ])
  if (error) throw error
  return toCards(data, labelsOf(schema))
}

// A6: the first page and the saved filter, in one round trip. The next pages come from moreAdsAction.
export async function searchAds(slug: string): Promise<AdSearch | null> {
  const community = await getCommunity(slug)
  if (!community) return null
  const supabase = await createClient()
  const [cards, filter] = await Promise.all([adPage(community.id, null), supabase.rpc('ad_filter', { p_community: community.id })])
  if (filter.error) throw filter.error
  return { communityId: community.id, cards, filter: fromSavedAdFilter(filter.data) }
}

// D1: your saved ad filter, to edit.
export async function getAdFilter(slug: string): Promise<AdFilter> {
  const community = await getCommunity(slug)
  if (!community) return fromSavedAdFilter(null)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('ad_filter', { p_community: community.id })
  if (error) throw error
  return fromSavedAdFilter(data)
}

// My ads and a profile's Ads: one member's ads, newest first (at most 20 exist).
export async function memberAds(slug: string, userId: string): Promise<AdCard[]> {
  const community = await getCommunity(slug)
  if (!community || !isUuid(userId)) return []
  const supabase = await createClient()
  const [{ data, error }, schema] = await Promise.all([
    supabase.rpc('member_ads', { p_community: community.id, p_user: userId }),
    getProfileSchema(community.id),
  ])
  if (error) throw error
  return toCards(data, labelsOf(schema))
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const ids = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

// D2/D3: one ad with its full image signed. Null: no such ad to see.
export async function getAd(slug: string, adId: string): Promise<AdDetail | null> {
  const community = await getCommunity(slug)
  if (!community || !isUuid(adId)) return null
  const supabase = await createClient()
  const [{ data, error }, schema] = await Promise.all([supabase.rpc('ad_view', { p_community: community.id, p_ad: adId }), getProfileSchema(community.id)])
  if (error) throw error
  if (!isRecord(data)) return null

  const labels = labelsOf(schema)
  const photo = isRecord(data.photo) ? data.photo : null
  const urls = await signAdPaths(photo ? [text(photo.path)] : [])
  const lookingForIds = ids(data.looking_for)
  const districtId = typeof data.district_id === 'string' ? data.district_id : null
  return {
    id: text(data.id),
    userId: text(data.user_id),
    own: data.own === true,
    username: text(data.username),
    status: label(labels, typeof data.status_id === 'string' ? data.status_id : null),
    ages: Array.isArray(data.ages) ? data.ages.filter((age): age is number => typeof age === 'number') : [],
    lookingForIds,
    lookingFor: lookingForIds.map((id) => label(labels, id)).filter(Boolean),
    headline: text(data.headline),
    body: text(data.body),
    districtId,
    district: label(labels, districtId),
    place: text(data.place),
    published: formatDay(new Date(text(data.published_at))),
    image: photo ? (urls.get(text(photo.path)) ?? null) : null,
    verified: photo?.taken_in_app === true,
  }
}
