import 'server-only'

// The privacy terms (long text), kept out of en.ts: en.ts is sent to the browser on every screen,
// this is only read by the server-rendered privacy page. A new language adds privacy.<locale>.ts.
// Draft text: the community owner must review it (and add contact details) before launch.

export type PrivacyText = {
  title: string
  intro: (community: string) => string
  sections: readonly { title: string; body: string }[]
}

export const privacyEn: PrivacyText = {
  title: 'Privacy terms',
  intro: (community) => `This is how ${community} handles your personal data. ${community} is a private community run by its admins on SoMe.`,
  sections: [
    {
      title: 'What we store',
      body: 'Your account: username, email address and password (stored encrypted). What you add to your profile: status, the answers to the profile fields, photos and linked profiles. Your messages, posts, ads and albums. When you apply: the application text, image and real names, which only the admins can see. Your private notes and stars about other members, which only you can see.',
    },
    {
      title: 'Why',
      body: 'To run the community: so you can log in, the admins can review applications, and members can find each other and talk. We do not sell your data and we do not show ads.',
    },
    {
      title: 'Where',
      body: 'Your data is stored on servers in the EU (Stockholm, Sweden). Emails such as the login code are sent by an email service in the EU.',
    },
    {
      title: 'Cookies and storage on your device',
      body: 'A cookie keeps you logged in. Your device also keeps settings such as light or dark mode, your filters and drafts. These are needed for the app to work. We do not use cookies for ads or tracking.',
    },
    {
      title: 'Photos “Taken in app”',
      body: 'A photo taken with the in-app camera is marked “Taken in app” with the date. It shows how the photo was taken; it does not prove who is in it.',
    },
    {
      title: 'How long',
      body: 'We keep your data while you have an account. When your account is deleted, everything that belongs to it is deleted too: your profile, photos, messages, ads, albums and notes.',
    },
    {
      title: 'Your rights',
      body: 'You can ask to see the data we hold about you, have it corrected, or have it deleted: ask a community admin, or delete your account yourself at the bottom of your profile. You can also complain to the Swedish Authority for Privacy Protection (IMY).',
    },
  ],
}
