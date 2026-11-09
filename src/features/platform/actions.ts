'use server'

import { refresh } from 'next/cache'
import { isUuid } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { deletePrivateFiles } from '@/lib/supabase/private-files'
import { createClient } from '@/lib/supabase/server'
import { HEADLINE_MAX, NAME_MAX, SLUG } from './types'

export type PlatformResult = { error: string } | undefined

// The platform admin's actions (client feedback 261102). Each is one RPC that checks the platform
// admin (supabase/migrations/20261103120000_feedback_261102.sql); the guards here only give a
// friendly message first.

// A new community with empty lists, at /{slug}.
export async function createCommunityAction(slug: string, name: string, headline: string): Promise<PlatformResult> {
  const address = slug.trim().toLowerCase()
  if (!SLUG.test(address)) return { error: t.platform.badAddress }
  if (!name.trim() || name.trim().length > NAME_MAX || headline.trim().length > HEADLINE_MAX) return { error: t.platform.invalid }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_community', { p_slug: address, p_name: name.trim(), p_headline: headline.trim() })
  if (error) {
    if (error.code === '23505') return { error: t.platform.taken }
    if (error.code === '22023') return { error: t.platform.badAddress }
    if (error.code === '42501') return { error: t.platform.notAllowed }
    return { error: t.common.error }
  }
  refresh()
}

// Make a member of the community its admin, or a member again. Appointing an applicant approves
// them; their application images go from Storage after the response.
export async function setCommunityAdminAction(communityId: string, username: string, admin: boolean): Promise<PlatformResult> {
  if (!isUuid(communityId) || !username.trim() || typeof admin !== 'boolean') return { error: t.platform.invalid }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_community_admin', { p_community: communityId, p_username: username.trim(), p_admin: admin })
  if (error) {
    if (error.code === '22023') return { error: t.platform.noMember }
    if (error.code === '42501') return { error: t.platform.notAllowed }
    return { error: t.common.error }
  }
  deletePrivateFiles(data)
  refresh()
}
