// UI-phase fixtures. Delete each part when its feature's queries.ts is wired to Supabase.

export const mockCommunities = [
  {
    slug: 'biking-stockholm',
    name: 'Biking Stockholm',
    headline: 'Rides, routes and people who love two wheels.',
    about: [
      'We are a community for everyone who rides in and around Stockholm — road, gravel and mountain bike.',
      'Members meet for weekly rides, share routes and help each other with gear. Every member has a real, verified profile.',
      'Join to see upcoming rides in the group calendars and get to know the people you ride with.',
    ],
    heroSrc: '/community/hero.png',
    aboutSrc: '/community/ride.png',
    adminUserId: 'u-admin',
  },
] as const

export const mockUsers = [
  { id: 'u-admin', username: 'Peter Admin' },
  { id: 'u-anna', username: 'Anna Lind' },
  { id: 'u-erik', username: 'Erik Berg' },
  { id: 'u-sara', username: 'Sara Holm' },
  { id: 'u-jonas', username: 'Jonas Ek' },
] as const

type MockChat = {
  id: string
  kind: 'dm' | 'group'
  name: string
  lastMessage: string | null
  minutesAgo: number
  unread: number
}

export const mockChats: MockChat[] = [
  { id: 'g-tuesday', kind: 'group', name: 'Tuesday Gravel Ride', lastMessage: 'Anna: Meeting at Slussen 18:00 👍', minutesAgo: 12, unread: 3 },
  { id: 'dm-anna', kind: 'dm', name: 'Anna Lind', lastMessage: 'See you on Tuesday!', minutesAgo: 45, unread: 1 },
  { id: 'g-mtb', kind: 'group', name: 'MTB Nacka', lastMessage: 'Erik: Trails are dry this weekend', minutesAgo: 190, unread: 1 },
  { id: 'dm-admin', kind: 'dm', name: 'Peter Admin', lastMessage: 'Welcome to the community!', minutesAgo: 60 * 26, unread: 1 },
  { id: 'g-road', kind: 'group', name: 'Road Cycling Sundays', lastMessage: 'Sara: Route for Sunday is posted', minutesAgo: 30, unread: 0 },
  { id: 'dm-erik', kind: 'dm', name: 'Erik Berg', lastMessage: 'Thanks for the tip on tyres', minutesAgo: 60 * 5, unread: 0 },
  { id: 'g-gear', kind: 'group', name: 'Gear & Repairs', lastMessage: 'Jonas: Anyone have a spare 11-speed chain?', minutesAgo: 60 * 50, unread: 0 },
  { id: 'dm-sara', kind: 'dm', name: 'Sara Holm', lastMessage: 'Great ride today', minutesAgo: 60 * 24 * 4, unread: 0 },
  { id: 'dm-jonas', kind: 'dm', name: 'Jonas Ek', lastMessage: null, minutesAgo: 60 * 24 * 12, unread: 0 },
  { id: 'g-commute', kind: 'group', name: 'Winter Commuters', lastMessage: 'Lina: Studded tyres are on', minutesAgo: 60 * 24 * 13, unread: 0 },
  { id: 'g-lidingo', kind: 'group', name: 'Lidingö Loop', lastMessage: 'Oskar: Saturday 09:00 at Ropsten', minutesAgo: 60 * 24 * 14, unread: 0 },
  { id: 'g-beginners', kind: 'group', name: 'New Riders', lastMessage: 'Maja: Is a hybrid bike fine?', minutesAgo: 60 * 24 * 15, unread: 0 },
  { id: 'g-routes', kind: 'group', name: 'Route Sharing', lastMessage: 'Anna: GPX for Tyresta is up', minutesAgo: 60 * 24 * 16, unread: 0 },
  { id: 'g-sale', kind: 'group', name: 'Buy & Sell', lastMessage: 'Erik: Selling 700x40 tyres', minutesAgo: 60 * 24 * 18, unread: 0 },
  { id: 'g-coffee', kind: 'group', name: 'Coffee Rides', lastMessage: 'Sara: Café in Saltsjöbaden?', minutesAgo: 60 * 24 * 20, unread: 0 },
  { id: 'g-touring', kind: 'group', name: 'Bikepacking', lastMessage: 'Jonas: Gotland in June?', minutesAgo: 60 * 24 * 22, unread: 0 },
  { id: 'g-night', kind: 'group', name: 'Night Rides', lastMessage: 'Peter: Headlamp recommendations', minutesAgo: 60 * 24 * 25, unread: 0 },
  { id: 'g-kids', kind: 'group', name: 'Family Rides', lastMessage: 'Anna: Short loop in Hagaparken', minutesAgo: 60 * 24 * 28, unread: 0 },
  { id: 'g-race', kind: 'group', name: 'Vätternrundan Training', lastMessage: 'Sara: 150 km this Sunday', minutesAgo: 60 * 24 * 31, unread: 0 },
]

export const mockMessages: Record<
  string,
  { author: string; mine: boolean; body: string; minutesAgo: number; reactions?: { emoji: string; count: number }[]; replyTo?: { author: string; body: string }; image?: boolean }[]
> = {
  'g-tuesday': [
    { author: 'Anna Lind', mine: false, body: 'Meeting at Slussen 18:00. Lights on, please.', minutesAgo: 40, reactions: [{ emoji: '👍', count: 2 }] },
    { author: 'Erik Berg', mine: false, body: 'I will bring a tube.', minutesAgo: 35, reactions: [{ emoji: '🙏', count: 1 }], replyTo: { author: 'Anna Lind', body: 'Meeting at Slussen 18:00. Lights on, please.' } },
    { author: 'Erik Berg', mine: false, body: 'I can bring a spare tube.', minutesAgo: 28, image: true },
    { author: 'You', mine: true, body: 'I will be there. Leaving Södermalm at 17:30.', minutesAgo: 18, reactions: [{ emoji: '👍', count: 1 }] },
    { author: 'Anna Lind', mine: false, body: 'Meeting at Slussen 18:00 👍', minutesAgo: 12 },
  ],
  'dm-anna': [
    { author: 'Anna Lind', mine: false, body: 'Are you joining the gravel ride?', minutesAgo: 80 },
    { author: 'You', mine: true, body: 'Yes. I will see you at the start.', minutesAgo: 60 },
    { author: 'Anna Lind', mine: false, body: 'See you on Tuesday!', minutesAgo: 45 },
  ],
  'dm-admin': [
    { author: 'Peter Admin', mine: false, body: 'Welcome to the community. Send me a note when your profile is filled in.', minutesAgo: 60 * 26 },
  ],
}

export const mockProfiles = [
  { id: 'u-admin', username: 'Peter Admin', about: 'Community admin. Road and gravel.', place: 'Stockholm', status: 'Man', age: 46, district: 'Stockholm', headline: 'Rides and routes', lastLogin: '22 Sep, 18:10', photo: { src: '/community/hero.png', verified: true, date: '2 Sep 2026' } },
  { id: 'u-anna', username: 'Anna Lind', about: 'Gravel on weekdays, long rides on Sunday.', place: 'Södermalm', status: 'Woman', age: 34, district: 'Södermalm', headline: 'Gravel, lights on', lastLogin: '23 Sep, 09:02', photo: { src: '/community/ride.png', verified: true, date: '23 Sep 2026' } },
  { id: 'u-erik', username: 'Erik Berg', about: 'Mountain bike in Nacka. Happy to fix a puncture.', place: 'Nacka', status: 'Man', age: 29, district: 'Nacka', headline: 'Trails when they are dry', lastLogin: '21 Sep, 16:40', photo: { src: '/community/hero.png', verified: false, date: '11 Aug 2026' } },
  { id: 'u-sara', username: 'Sara Holm', about: 'Road cycling. I post the Sunday route.', place: 'Solna', status: 'Woman', age: 38, district: 'Solna', headline: 'Sunday road ride', lastLogin: '23 Sep, 07:15', photo: { src: '/community/ride.png', verified: true, date: '19 Sep 2026' } },
  { id: 'u-jonas', username: 'Jonas Ek', about: 'Workshop and spare parts.', place: 'Årsta', status: 'Man', age: 41, district: 'Årsta', headline: 'Chains and tyres', lastLogin: '20 Sep, 12:00', photo: null },
]

export const mockGroups = [
  { id: 'g-tuesday', name: 'Tuesday Gravel Ride', headline: 'Weekly gravel from Slussen', directJoin: false, calendar: true, history: true, memberList: true, editPosts: true, posting: true, commenting: true, reactions: true },
  { id: 'g-mtb', name: 'MTB Nacka', headline: 'Trail conditions and meeting points', directJoin: true, calendar: true, history: false, memberList: true, editPosts: true, posting: true, commenting: true, reactions: true },
  { id: 'g-road', name: 'Road Cycling Sundays', headline: 'The Sunday route', directJoin: false, calendar: false, history: true, memberList: false, editPosts: false, posting: true, commenting: true, reactions: true },
  { id: 'g-gear', name: 'Gear & Repairs', headline: 'Parts, tools, and workshop time', directJoin: true, calendar: false, history: true, memberList: true, editPosts: true, posting: true, commenting: true, reactions: true },
]

// Info 1–3 per group (headline + body). Groups without an entry use the default set.
export const mockInfoPosts: Record<string, { headline: string; body: string }[]> = {
  default: [
    { headline: 'Rules', body: 'Be kind. Stay on topic. Ask the admin before you post an ad.' },
    { headline: 'FAQ', body: 'Ask in the chat. Someone usually answers within the hour.' },
    { headline: 'Contact', body: 'Message the group admin if something is wrong.' },
  ],
  'g-tuesday': [
    {
      headline: 'Rules',
      body: 'We ride every Tuesday from Slussen at 18:00.\n\nBring lights, the route is unlit after the bridge. Front and rear lights are required from October.\n\nThe pace is conversational and no one is dropped. If you have a puncture, the group waits.\n\nBe kind in the chat. Keep posts about the ride, routes and gear.',
    },
    {
      headline: 'Route and pace',
      body: 'The standard loop is 42 km with about 350 m of climbing. Around 60% is gravel.\n\nAverage speed is 22–25 km/h. We stop for coffee at the halfway point in Nacka.\n\nA shorter 25 km option splits off at Hammarby sjöstad for anyone who wants to head home early.',
    },
    {
      headline: 'Weather',
      body: 'Rain cancels the ride. The admin posts a message here by 16:00 if the ride is off.\n\nIn winter we switch to studded tyres from the first frost. Ask in the chat if you want advice on tyres.',
    },
  ],
}

export const mockEvents: { id: string; groupId: string; date: string; headline: string; text: string }[] = [
  { id: 'ev-sep-8', groupId: 'g-tuesday', date: '2026-09-08', headline: 'Tuesday gravel', text: 'Meet at Slussen, 18:00. Lights on.' },
  { id: 'ev-sep-8b', groupId: 'g-tuesday', date: '2026-09-08', headline: 'Coffee stop', text: 'Halfway in Nacka. The group waits.' },
  { id: 'ev-sep-22', groupId: 'g-tuesday', date: '2026-09-22', headline: 'Tuesday gravel', text: '42 km loop. Shorter option splits at Hammarby.' },
  { id: 'ev-jul-6', groupId: 'g-tuesday', date: '2026-07-06', headline: 'Tuesday gravel', text: 'Meet at Slussen, 18:00.' },
]

export const mockGroupMembers: Record<string, string[]> = {
  'g-tuesday': ['u-anna', 'u-erik', 'u-sara'],
  'g-mtb': ['u-erik', 'u-jonas'],
  'g-road': ['u-sara', 'u-anna'],
  'g-gear': ['u-jonas', 'u-admin'],
}
