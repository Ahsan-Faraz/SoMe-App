import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { requestSite } from '@/lib/sites'
import { createPublicClient } from '@/lib/supabase/public'
import type { Community } from './types'

export const communityTag = (community: Pick<Community, 'site' | 'slug'>) => `community:${community.site}:${community.slug}`

// The community at /{slug} on the domain being served (lib/sites.ts): the same address on another
// site is another community, and a community never opens on a domain that isn't its site's.
export async function getCommunity(slug: string): Promise<Community | null> {
  return getSiteCommunity(await requestSite(), slug)
}

// Cached per site + slug: the host is read outside, since a cached function can't read the request.
export async function getSiteCommunity(site: string, slug: string): Promise<Community | null> {
  'use cache'
  cacheLife('days')
  cacheTag(communityTag({ site, slug }))

  const { data, error } = await createPublicClient()
    .from('communities')
    .select('id, site, slug, name, headline, about, hero_path, about_path, application_text, require_app_image, require_app_text, require_app_names, require_identity, require_age_18, keep_application_images, direct_join, privacy_version, domain, state_label_1, state_label_2, state_label_3')
    .eq('site', site)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    site: data.site,
    slug: data.slug,
    name: data.name,
    headline: data.headline,
    about: data.about,
    heroSrc: data.hero_path ?? '/community/hero.png',
    aboutSrc: data.about_path ?? '/community/ride.png',
    applicationText: data.application_text ?? '',
    requires: { image: data.require_app_image, text: data.require_app_text, names: data.require_app_names, identity: data.require_identity },
    directJoin: data.direct_join,
    requireAge18: data.require_age_18,
    keepApplicationImages: data.keep_application_images,
    privacyVersion: data.privacy_version,
    domain: data.domain,
    stateLabels: [data.state_label_1 ?? '', data.state_label_2 ?? '', data.state_label_3 ?? ''],
  }
}
