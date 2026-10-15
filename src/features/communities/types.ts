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
  requires: { image: boolean; text: boolean; names: boolean }
  stateLabels: [string, string, string] // the admin records' 3 numbered "profile states"; '' = unused
}
