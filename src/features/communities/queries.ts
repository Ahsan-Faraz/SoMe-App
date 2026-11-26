import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { profilePhotoUrl } from '@/features/profiles/photo'
import { requestSite } from '@/lib/sites'
import { createPublicClient } from '@/lib/supabase/public'
import { createClient } from '@/lib/supabase/server'
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
    .select('id, site, slug, name, start_title, headline, listed, about, hero_path, about_path, application_text, require_app_image, require_app_text, require_app_names, require_identity, require_age_18, keep_application_images, direct_join, privacy_version, domain, state_label_1, state_label_2, state_label_3')
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
    title: data.start_title ?? data.name,
    startTitle: data.start_title ?? '',
    headline: data.headline,
    about: data.about,
    heroSrc: imageSrc(data.hero_path, '/community/hero.png'),
    heroUploaded: isUploaded(data.hero_path),
    listed: data.listed,
    aboutSrc: imageSrc(data.about_path, '/community/ride.png'),
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

// /communities on the main domain: the logged-in login's communities on this site, then the visible
// ones it can join (site_communities). Per person, so never cached; one query.
export type SiteCommunity = { slug: string; name: string; headline: string; state: 'approved' | 'pending' | null }

export async function getSiteCommunities(site: string): Promise<SiteCommunity[]> {
  const { data, error } = await (await createClient()).rpc('site_communities', { p_site: site })
  if (error) throw error
  return data.map((row) => ({
    slug: row.slug,
    name: row.name,
    headline: row.headline,
    state: row.state === 'approved' ? 'approved' : row.state ? 'pending' : null,
  }))
}

// A built-in picture starts with '/'; anything else is a file the admin uploaded to the public
// `profile` bucket ({community}/start/{uuid}.webp, save_community_start).
const isUploaded = (path: string | null): path is string => !!path && !path.startsWith('/')
const imageSrc = (path: string | null, fallback: string) => (isUploaded(path) ? profilePhotoUrl(path) : (path ?? fallback))
