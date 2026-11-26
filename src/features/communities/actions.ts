'use server'

import { updateTag } from 'next/cache'
import { isBool, isRecord } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { START_ABOUT_MAX, START_PARAGRAPHS_MAX, START_SUBTITLE_MAX, START_TITLE_MAX } from '@/lib/limits'
import { deleteStartImage } from '@/lib/supabase/private-files'
import { createClient } from '@/lib/supabase/server'
import { communityTag, getCommunity } from './queries'

export type SettingsResult = { error: string } | undefined

// What the community admin sets on the settings screen. Required profile fields stay in the builder.
// stateLabels: the names of the three "profile state" columns of the member list (D24); '' hides one.
// age18: sign-up asks "I am 18 or older". keepImages: an approved application keeps its images.
export type CommunitySettings = {
  applicationText: string
  image: boolean
  text: boolean
  names: boolean
  directJoin: boolean
  age18: boolean
  keepImages: boolean
  stateLabels: [string, string, string]
}

const APPLICATION_TEXT_MAX = 4000 // communities.application_text
const STATE_LABEL_MAX = 40 // communities.state_label_1..3

// Community settings (client feedback 261102): one RPC, save_community_settings, which checks the
// community admin. The community row is cached for days, so its tag is cleared here.
export async function saveCommunitySettingsAction(slug: string, settings: CommunitySettings): Promise<SettingsResult> {
  if (
    !isRecord(settings) ||
    typeof settings.applicationText !== 'string' ||
    settings.applicationText.length > APPLICATION_TEXT_MAX ||
    ![settings.image, settings.text, settings.names, settings.directJoin, settings.age18, settings.keepImages].every(isBool) ||
    !Array.isArray(settings.stateLabels) ||
    settings.stateLabels.length !== 3 ||
    !settings.stateLabels.every((label) => typeof label === 'string' && label.trim().length <= STATE_LABEL_MAX)
  ) {
    return { error: t.settings.invalid }
  }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_community_settings', {
    p_community: community.id,
    p_settings: {
      application_text: settings.applicationText,
      require_app_image: settings.image,
      require_app_text: settings.text,
      require_app_names: settings.names,
      direct_join: settings.directJoin,
      require_age_18: settings.age18,
      keep_application_images: settings.keepImages,
      state_labels: settings.stateLabels.map((label) => label.trim()),
    },
  })
  if (error) return { error: error.code === '42501' ? t.settings.notAllowed : t.common.error }
  updateTag(communityTag(community))
}

// The start page (client guide 261123): headline (empty = the community's name), subheadline,
// info text (paragraphs split on empty lines) and image. image: left out keeps the current one, null
// goes back to the built-in picture, a path is a file the admin has just uploaded (uploadStartImage).
// listed: shown on the main domain's community list (/communities) to logins that aren't members.
export type CommunityStartPage = { title: string; headline: string; about: string; listed: boolean; image?: string | null }

export async function saveCommunityStartAction(slug: string, start: CommunityStartPage): Promise<SettingsResult> {
  if (!isRecord(start) || typeof start.title !== 'string' || typeof start.headline !== 'string' || typeof start.about !== 'string' || !isBool(start.listed)) {
    return { error: t.settings.invalid }
  }
  const about = splitParagraphs(start.about)
  const image = start.image
  if (
    start.title.trim().length > START_TITLE_MAX ||
    start.headline.trim().length > START_SUBTITLE_MAX ||
    about.length > START_PARAGRAPHS_MAX ||
    about.join('').length > START_ABOUT_MAX ||
    (image !== undefined && image !== null && typeof image !== 'string')
  ) {
    return { error: t.settings.startTooLong }
  }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_community_start', {
    p_community: community.id,
    p_start: { title: start.title, headline: start.headline, about, listed: start.listed, ...(image === undefined ? {} : { image }) },
  })
  if (error) return { error: error.code === '42501' ? t.settings.notAllowed : error.code === '22001' ? t.settings.startTooLong : t.common.error }
  deleteStartImage(data)
  updateTag(communityTag(community))
}

const splitParagraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
