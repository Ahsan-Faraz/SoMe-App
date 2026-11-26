import 'server-only'
import { headers } from 'next/headers'

// A site is one domain's world (client decision 261102): its own communities and its own logins.
// theirl.net/demo and aiproduktion.se/demo are two communities, and the same email is two logins.
// A request's site comes from its host, by a setting rather than the database (like
// lib/domains.ts): SITE_HOSTS="theirl.net=theirl,www.theirl.net=theirl,aiproduktion.se=aiproduktion".
// A host with a port ("localhost:3001=aiproduktion") is matched first, so two sites can be tried on
// one machine. Any other host is the default site, DEFAULT_SITE or 'main' (communities.site default).
// WARNING: every deployment on the same database needs this build before two communities share an
// address (docs/prod-db-changes-steps-9-11.md §5).

const SITE = /^[a-z0-9-]{2,40}$/ // communities.site
const HOST = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/

function parse(setting: string | undefined): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  for (const entry of (setting ?? '').split(',')) {
    const [host, site] = entry.split('=').map((part) => part?.trim().toLowerCase())
    if (host && site && HOST.test(host) && SITE.test(site)) map.set(host, site)
  }
  return map
}

// Read once per server instance.
const hosts = parse(process.env.SITE_HOSTS)
const fallback = SITE.test(process.env.DEFAULT_SITE ?? '') ? (process.env.DEFAULT_SITE as string) : 'main'

export function siteForHost(host: string | null): string {
  const name = host?.trim().toLowerCase() ?? ''
  return hosts.get(name) ?? hosts.get(name.split(':')[0] ?? '') ?? fallback
}

// The site of the request being served. Reads the Host header, so it runs at request time only
// (inside <Suspense>, a Server Action or a route handler), never inside 'use cache'.
export async function requestSite(): Promise<string> {
  return siteForHost((await headers()).get('host'))
}

// The domain being served as people know it ("theirl.net"): the name in the main domain's emails.
export async function requestSiteName(): Promise<string> {
  const host = (await headers()).get('host')?.trim().toLowerCase() ?? ''
  return host.replace(/:\d+$/, '').replace(/^www\./, '') || 'SoMe'
}
