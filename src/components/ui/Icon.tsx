const paths = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35',
  chevronLeft: 'm15 18-6-6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0m1-9a3 3 0 1 0 0-6m2 15a6 6 0 0 0-3-5.2',
  usersPlus: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0M19 8v6m-3-3h6',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm12-3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14',
  mail: 'M4 6h16v12H4zm0 0 8 7 8-7',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'm5 12 5 5 9-10',
  filter: 'M4 6h16M7 12h10M10 18h4',
  trash: 'M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13',
  calendar: 'M5 5h14v14H5zM5 9h14M8 3v4M16 3v4',
  send: 'M4 12 20 4l-6 16-2-7z',
  leave: 'M10 7V4H4v16h6v-3M10 12h10M16 8l4 4-4 4',
  logout: 'M9 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4M16 16l4-4-4-4M20 12H9',
  note: 'M6 3h9l3 3v15H6zM15 3v4h4',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  image: 'M4 5h16v14H4zm0 11 5-5 4 4 2-2 5 5M15.5 9.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-5m0-3h.01',
} as const

const solids = {
  chatSolid: 'M12 3a9 9 0 0 0-7.9 13.3L3 21l4.8-1.1A9 9 0 1 0 12 3Z',
  usersSolid:
    'M9 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 20a7 7 0 0 1 14 0v1H2Zm14.5-9a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM18 21h4v-1a5.5 5.5 0 0 0-6.6-5.4A8.9 8.9 0 0 1 18 20Z',
  megaphoneSolid: 'M20 4v16l-7-4H6a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h7l7-4ZM7 17h3.2l1.3 4H8.3Z',
  starSolid: 'm12 2.5 2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8Z',
} as const

export type IconName = keyof typeof paths | keyof typeof solids

export function Icon({ name, className = 'size-6' }: { name: IconName; className?: string }) {
  if (name in solids) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d={solids[name as keyof typeof solids]} />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[name as keyof typeof paths]} />
    </svg>
  )
}
