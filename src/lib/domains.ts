// Communities on their own domain (D30). The proxy maps a request's host to its community here, from a
// setting rather than the database: the proxy stays free of database queries (project rule), and a new
// domain is added in the hosting's domain settings anyway, so this setting changes in the same step.
// COMMUNITY_DOMAINS: "club-example.com=biking-stockholm,www.club-example.com=biking-stockholm".
// communities.domain stays the source for links and emails.

const SLUG = /^[a-z0-9-]{2,40}$/ // COMMUNITY_SLUG
const HOST = /^[a-z0-9.-]{1,253}$/

function parse(setting: string | undefined): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  for (const entry of (setting ?? '').split(',')) {
    const [host, slug] = entry.split('=').map((part) => part?.trim().toLowerCase())
    if (host && slug && HOST.test(host) && SLUG.test(slug)) map.set(host, slug)
  }
  return map
}

// Read once per server instance.
const domains = parse(process.env.COMMUNITY_DOMAINS)

// The community whose own domain this is ("club-example.com:443" works too), or null for the platform.
export function communityForHost(host: string | null): string | null {
  if (!host) return null
  return domains.get(host.split(':')[0]?.toLowerCase() ?? '') ?? null
}

// Every own-domain host, for the platform-only `/` redirect in next.config.ts.
export function ownDomainHosts(): string[] {
  return [...domains.keys()]
}
