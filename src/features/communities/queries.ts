import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import type { Community } from './types'

export const communityTag = (slug: string) => `community:${slug}`

export async function getCommunity(slug: string): Promise<Community | null> {
  'use cache'
  cacheLife('days')
  cacheTag(communityTag(slug))

  const { data, error } = await createPublicClient()
    .from('communities')
    .select('id, slug, name, headline, about, hero_path, about_path, application_text, require_app_image, require_app_text, require_app_names, state_label_1, state_label_2, state_label_3')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    headline: data.headline,
    about: data.about,
    heroSrc: data.hero_path ?? '/community/hero.png',
    aboutSrc: data.about_path ?? '/community/ride.png',
    applicationText: data.application_text ?? '',
    requires: { image: data.require_app_image, text: data.require_app_text, names: data.require_app_names },
    stateLabels: [data.state_label_1 ?? '', data.state_label_2 ?? '', data.state_label_3 ?? ''],
  }
}
