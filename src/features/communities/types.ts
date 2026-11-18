export type Community = {
  id: string
  site: string // the domain's world it belongs to (lib/sites.ts); its logins are this site's
  slug: string // unique inside its site
  name: string
  headline: string
  about: readonly string[]
  heroSrc: string
  aboutSrc: string
  // The community application (A25): its text on top, and what it asks for.
  applicationText: string
  requires: { image: boolean; text: boolean; names: boolean; identity: boolean }
  directJoin: boolean // an application is approved as it's sent, with no images (client 261102)
  requireAge18: boolean // sign-up asks "I am 18 or older" (D31)
  keepApplicationImages: boolean // approved applications keep their images (261115); else deleted on decision
  privacyVersion: string // the privacy text members agree to at sign-up (D32)
  domain: string | null // the community's own domain (D30); null = the platform path only
  stateLabels: [string, string, string] // the admin records' 3 numbered "profile states"; '' = unused
}
