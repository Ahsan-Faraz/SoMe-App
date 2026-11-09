// A community as the platform admin's screen lists it.
export type PlatformCommunity = { id: string; slug: string; name: string; directJoin: boolean; members: number; admins: string[] }

// communities.slug: the address at /{slug}.
export const SLUG = /^[a-z0-9-]{2,40}$/
export const NAME_MAX = 80
export const HEADLINE_MAX = 200
