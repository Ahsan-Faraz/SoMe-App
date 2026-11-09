import 'server-only'

// The terms of use (long text), kept out of en.ts like the privacy terms. A placeholder until the
// client provides the real terms (client feedback 261102: "legal: placeholders for now").

export type TermsText = {
  title: string
  intro: (community: string) => string
  sections: readonly { title: string; body: string }[]
}

export const termsEn: TermsText = {
  title: 'Terms of use',
  intro: (community) => `These are the terms for using ${community}. The final terms are being written and will replace this page.`,
  sections: [
    {
      title: 'Placeholder',
      body: 'The community owner will publish the full terms of use here before launch. Until then, the privacy terms describe how your data is handled.',
    },
  ],
}
