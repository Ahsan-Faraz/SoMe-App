'use server'

import { updateTag } from 'next/cache'
import { isBool, isRecord } from '@/lib/guards'
import { t } from '@/lib/i18n'
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
