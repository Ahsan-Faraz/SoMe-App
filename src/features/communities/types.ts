export type Community = {
  id: string
  site: string // the domain's world it belongs to (lib/sites.ts); its logins are this site's
  slug: string // unique inside its site
  name: string
  // The start page (/{community}), set by the community admin: headline, subheadline, image, info text.
  title: string // the headline: startTitle, or the name when that is empty
  startTitle: string // '' = use the name
  headline: string // the subheadline
  about: readonly string[] // the info text, one entry per paragraph
  heroSrc: string
  heroUploaded: boolean // heroSrc is the admin's own image, not the built-in picture
  listed: boolean // visible on the main domain's /communities for logins that aren't members (261123)
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
