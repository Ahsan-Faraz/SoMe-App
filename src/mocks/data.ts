// UI-phase fixtures. Delete each part when its feature's queries.ts is wired to Supabase.

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

// Mock profiles for screens not on the database yet (A27 swipe, chats, applications, ads).
type MockProfile = {
  id: string
  username: string
  about: string
  place: string
  status: string
  age: number
  district: string
  headline: string
  lastLogin: string
  score: number
  lookingFor: string[]
  photo: { src: string; verified: boolean; date: string } | null
}

export const mockProfiles: MockProfile[] = [
  { id: 'u-admin', username: 'Peter Admin', about: 'Community admin. Road and gravel.', place: 'Stockholm', status: 'Man', age: 46, district: 'Stockholm', headline: 'Rides and routes', lastLogin: '22 Sep, 18:10', score: 92, lookingFor: ['Man', 'Woman'], photo: { src: '/community/hero.png', verified: true, date: '2 Sep 2026' } },
  { id: 'u-anna', username: 'Anna Lind', about: 'Gravel on weekdays, long rides on Sunday.', place: 'Södermalm', status: 'Woman', age: 34, district: 'Södermalm', headline: 'Gravel, lights on', lastLogin: '23 Sep, 09:02', score: 78, lookingFor: ['Woman', 'Couple MF'], photo: { src: '/community/ride.png', verified: true, date: '23 Sep 2026' } },
  { id: 'u-erik', username: 'Erik Berg', about: 'Mountain bike in Nacka. Happy to fix a puncture.', place: 'Nacka', status: 'Man', age: 29, district: 'Nacka', headline: 'Trails when they are dry', lastLogin: '21 Sep, 16:40', score: 55, lookingFor: ['Man'], photo: { src: '/community/hero.png', verified: false, date: '11 Aug 2026' } },
  { id: 'u-sara', username: 'Sara Holm', about: 'Road cycling. I post the Sunday route.', place: 'Solna', status: 'Woman', age: 38, district: 'Solna', headline: 'Sunday road ride', lastLogin: '23 Sep, 07:15', score: 81, lookingFor: ['Woman', 'Man'], photo: { src: '/community/ride.png', verified: true, date: '19 Sep 2026' } },
  { id: 'u-jonas', username: 'Jonas Ek', about: 'Workshop and spare parts.', place: 'Årsta', status: 'Man', age: 41, district: 'Årsta', headline: 'Chains and tyres', lastLogin: '20 Sep, 12:00', score: 40, lookingFor: [], photo: null },
  { id: 'u-lina', username: 'Lina Ström', about: 'Winter commuter, studded tyres from November.', place: 'Hornstull', status: 'Woman', age: 27, district: 'Södermalm', headline: 'All-year commuting', lastLogin: '24 Sep, 08:05', score: 63, lookingFor: ['Woman'], photo: { src: '/community/ride.png', verified: true, date: '20 Sep 2026' } },
  { id: 'u-oskar', username: 'Oskar Nyberg', about: 'Lidingö loop on Saturdays.', place: 'Lidingö', status: 'Other', age: 35, district: 'Stockholm', headline: 'Saturday 09:00 at Ropsten', lastLogin: '19 Sep, 10:30', score: 47, lookingFor: ['Man', 'Other'], photo: null },
  { id: 'u-maja', username: 'Maja & Leo', about: 'We ride a tandem. Slow and happy.', place: 'Sundbyberg', status: 'Couple MF', age: 31, district: 'Solna', headline: 'Tandem weekends', lastLogin: '23 Sep, 19:45', score: 70, lookingFor: ['Couple MF', 'Couple FF'], photo: { src: '/community/hero.png', verified: true, date: '15 Sep 2026' } },
]


// Not members yet: they applied to the community (A20). Admins can open their profiles (A21).
export const mockApplicants: MockProfile[] = [
  { id: 'u-kitty', username: 'Kitty553', about: 'New to gravel, rode road for years.', place: 'Kungsholmen', status: 'Woman', age: 29, district: 'Stockholm', headline: 'Looking for a Tuesday group', lastLogin: '4 Oct, 20:12', score: 35, lookingFor: ['Woman', 'Man'], photo: { src: '/community/ride.png', verified: true, date: '4 Oct 2026' } },
  { id: 'u-bikecpl', username: 'BikeCpl42', about: 'We ride a tandem and two gravel bikes.', place: 'Bromma', status: 'Couple MF', age: 38, district: 'Stockholm', headline: 'Weekend rides together', lastLogin: '4 Oct, 18:40', score: 42, lookingFor: ['Couple MF'], photo: { src: '/community/hero.png', verified: true, date: '3 Oct 2026' } },
  { id: 'u-bikersx', username: 'BikersX99', about: 'Commuters who want longer weekend loops.', place: 'Täby', status: 'Couple MM', age: 33, district: 'Solna', headline: 'Long loops, slow coffee', lastLogin: '3 Oct, 09:15', score: 30, lookingFor: ['Couple MM', 'Man'], photo: null },
]

// Admin-only member data per group (the community's is in the database since step 4):
// real names (from the application), the 3 profile-state numbers and the admin's notes.
export const mockRealNames: Record<string, string[]> = {
  'u-admin': ['Peter Ström'],
  'u-anna': ['Anna Lind'],
  'u-erik': ['Erik Berg'],
  'u-sara': ['Sara Holm'],
  'u-jonas': ['Jonas Ek'],
  'u-maja': ['Maja Berg', 'Leo Berg'],
  'u-kitty': ['Karin Ek'],
  'u-bikecpl': ['John Doe', 'Anna Doe'],
  'u-bikersx': ['Max Lund', 'Ola Lund'],
}

export const mockMemberState: Record<string, Record<string, { state: string[]; notes?: string }>> = {
  'g-tuesday': {
    'u-anna': { state: ['150', '4', '12'] },
    'u-erik': { state: ['150', '9', '6'], notes: 'Brings spare tubes.' },
    'u-sara': { state: ['0', '', '2'] },
  },
}

// Open group applications (A23), until backend step 7.
export const mockApplications: Record<string, { userId: string; message: string; image: { src: string; verified: boolean; date: string } | null }[]> = {
  'g-tuesday': [
    { userId: 'u-jonas', message: 'Can I join on Tuesdays? I can bring tools.', image: { src: '/community/ride.png', verified: true, date: '2 Oct 2026' } },
    { userId: 'u-maja', message: 'We would like to try the loop on our tandem.', image: null },
  ],
}

export const mockGroups = [
  { id: 'g-tuesday', name: 'Tuesday Gravel Ride', headline: 'Weekly gravel from Slussen', directJoin: false, calendar: true, history: true, memberList: true, editPosts: true, posting: true, commenting: true, reactions: true },
  { id: 'g-mtb', name: 'MTB Nacka', headline: 'Trail conditions and meeting points', directJoin: true, calendar: true, history: false, memberList: true, editPosts: true, posting: true, commenting: true, reactions: true },
  { id: 'g-road', name: 'Road Cycling Sundays', headline: 'The Sunday route', directJoin: false, calendar: false, history: true, memberList: false, editPosts: false, posting: true, commenting: true, reactions: true },
  { id: 'g-gear', name: 'Gear & Repairs', headline: 'Parts, tools, and workshop time', directJoin: true, calendar: false, history: true, memberList: true, editPosts: true, posting: true, commenting: true, reactions: true },
  // Not in the viewer's chat list: found with "Find new user/group".
  { id: 'g-archipelago', name: 'Archipelago Tours', headline: 'Island hopping by bike and ferry', directJoin: false, calendar: true, history: true, memberList: true, editPosts: true, posting: true, commenting: true, reactions: true },
  { id: 'g-cx', name: 'Cyclocross Autumn', headline: 'Mud, barriers and coffee', directJoin: true, calendar: false, history: true, memberList: true, editPosts: true, posting: true, commenting: true, reactions: true },
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

// createdBy = who to DM about the event.
export const mockEvents: { id: string; groupId: string; date: string; headline: string; text: string; createdBy: string }[] = [
  { id: 'ev-sep-8', groupId: 'g-tuesday', date: '2026-09-08', headline: 'Tuesday gravel', text: 'Meet at Slussen, 18:00. Lights on.', createdBy: 'u-admin' },
  { id: 'ev-sep-8b', groupId: 'g-tuesday', date: '2026-09-08', headline: 'Coffee stop', text: 'Halfway in Nacka. The group waits.', createdBy: 'u-admin' },
  { id: 'ev-sep-22', groupId: 'g-tuesday', date: '2026-09-22', headline: 'Tuesday gravel', text: '42 km loop. Shorter option splits at Hammarby.', createdBy: 'u-admin' },
  { id: 'ev-jul-6', groupId: 'g-tuesday', date: '2026-07-06', headline: 'Tuesday gravel', text: 'Meet at Slussen, 18:00.', createdBy: 'u-admin' },
]

export const mockGroupMembers: Record<string, string[]> = {
  'g-tuesday': ['u-anna', 'u-erik', 'u-sara'],
  'g-mtb': ['u-erik', 'u-jonas'],
  'g-road': ['u-sara', 'u-anna'],
  'g-gear': ['u-jonas', 'u-admin'],
  'g-archipelago': ['u-lina', 'u-oskar'],
  'g-cx': ['u-oskar', 'u-erik'],
}
