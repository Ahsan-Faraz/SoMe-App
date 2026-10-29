'use server'

import { getCommunity } from '@/features/communities/queries'
import { isBool, isRecord, isUuid } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { HEADLINE_MAX, LONG_TEXT_MAX, PLACE_MAX } from '@/lib/limits'
import { deletePrivateFiles } from '@/lib/supabase/private-files'
import { createClient } from '@/lib/supabase/server'
import { adPage } from './queries'
import type { AdCard } from './types'

// Ad writes and the Ads tab's next pages. Each is one RPC that checks the caller
// (supabase/migrations/20261030120000_ads.sql); the guards here only turn bad input into a friendly
// message first. A deleted or replaced image's files are removed after the response.

export type AdResult = { error: string } | { id: string }

const errorText = (code: string) => (code === '42501' ? t.ads.notAllowed : code === '22023' ? t.ads.invalid : t.common.error)

// The page after the last card (keyset), its thumbnails signed. [] when nothing more can be read.
export async function moreAdsAction(slug: string, after: { publishedAt: string; id: string }): Promise<AdCard[]> {
  if (!isRecord(after) || typeof after.publishedAt !== 'string' || Number.isNaN(Date.parse(after.publishedAt)) || !isUuid(after.id)) return []
  const community = await getCommunity(slug)
  if (!community) return []
  return adPage(community.id, { publishedAt: after.publishedAt, id: after.id })
}

// D2 Publish: a new ad (adId null) or an edit of yours. photo: an image already uploaded to your
// folder of the private bucket (save_ad checks both files are there), or null to keep the current one.
export async function saveAdAction(slug: string, adId: string | null, ad: unknown, photo: unknown): Promise<AdResult> {
  if ((adId !== null && !isUuid(adId)) || !isRecord(ad)) return { error: t.common.error }
  const { lookingFor, headline, body, districtId, place } = ad
  if (
    !Array.isArray(lookingFor) || lookingFor.length === 0 || !lookingFor.every(isUuid) ||
    typeof headline !== 'string' || !headline.trim() || headline.trim().length > HEADLINE_MAX ||
    typeof body !== 'string' || body.trim().length > LONG_TEXT_MAX ||
    typeof place !== 'string' || place.trim().length > PLACE_MAX ||
    (districtId !== null && !isUuid(districtId))
  ) {
    return { error: t.ads.invalid }
  }
  let image: { path: string; thumb_path: string; width: number; height: number; taken_in_app: boolean } | undefined
  if (photo !== null) {
    if (!isRecord(photo)) return { error: t.common.error }
    const { path, thumb_path, width, height, taken_in_app } = photo
    if (typeof path !== 'string' || typeof thumb_path !== 'string' || !Number.isInteger(width) || !Number.isInteger(height) || !isBool(taken_in_app)) {
      return { error: t.common.error }
    }
    image = { path, thumb_path, width: width as number, height: height as number, taken_in_app }
  }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_ad', {
    p_community: community.id,
    p_ad: adId as string, // null publishes a new ad (the generated types can't say so)
    p_looking_for: lookingFor,
    p_headline: headline.trim(),
    p_body: body.trim(),
    p_district: districtId as string, // null: no district
    p_place: place.trim(),
    p_photo: image,
  })
  if (error) return { error: errorText(error.code) }
  deletePrivateFiles(data)
  return { id: isRecord(data) && typeof data.id === 'string' ? data.id : '' }
}

// D2 Delete: your ad, then its image's files (after the response).
export async function deleteAdAction(slug: string, adId: string): Promise<{ error: string } | undefined> {
  if (!isUuid(adId)) return { error: t.common.error }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_ad', { p_community: community.id, p_ad: adId })
  if (error) return { error: errorText(error.code) }
  deletePrivateFiles(data)
}
