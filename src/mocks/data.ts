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
]
