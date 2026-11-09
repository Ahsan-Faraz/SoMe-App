'use server'

import { updateTag } from 'next/cache'
import { isBool, isRecord } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { communityTag, getCommunity } from './queries'

export type SettingsResult = { error: string } | undefined

// What the community admin sets on the settings screen. Required profile fields stay in the builder.
export type CommunitySettings = { applicationText: string; image: boolean; text: boolean; names: boolean; directJoin: boolean }

const APPLICATION_TEXT_MAX = 4000 // communities.application_text

// Community settings (client feedback 261102): one RPC, save_community_settings, which checks the
// community admin. The community row is cached for days, so its tag is cleared here.
export async function saveCommunitySettingsAction(slug: string, settings: CommunitySettings): Promise<SettingsResult> {
  if (
    !isRecord(settings) ||
    typeof settings.applicationText !== 'string' ||
    settings.applicationText.length > APPLICATION_TEXT_MAX ||
    ![settings.image, settings.text, settings.names, settings.directJoin].every(isBool)
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
    },
  })
  if (error) return { error: error.code === '42501' ? t.settings.notAllowed : t.common.error }
  updateTag(communityTag(slug))
}
