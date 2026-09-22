import 'server-only'
import { cache } from 'react'
import { mockCommunities } from '@/mocks/data'
import type { Community } from './types'

export const getCommunity = cache(async (slug: string): Promise<Community | null> => {
  return mockCommunities.find((community) => community.slug === slug) ?? null
})
