export type Community = {
  id: string
  slug: string
  name: string
  headline: string
  about: readonly string[]
  heroSrc: string
  aboutSrc: string
  // The community application (A25): its text on top, and what it asks for.
  applicationText: string
  requires: { image: boolean; text: boolean; names: boolean; identity: boolean }
  requireAge18: boolean // sign-up asks "I am 18 or older" (D31)
  privacyVersion: string // the privacy text members agree to at sign-up (D32)
  domain: string | null // the community's own domain (D30); null = the platform path only
  stateLabels: [string, string, string] // the admin records' 3 numbered "profile states"; '' = unused
}
