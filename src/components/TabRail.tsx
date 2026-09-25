'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon, type IconName } from '@/components/ui/Icon'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { t } from '@/lib/i18n'

const tabs: { id: 'chats' | 'profiles' | 'ads'; href: string; icon: IconName; label: string }[] = [
  { id: 'chats', href: 'chats', icon: 'chatSolid', label: t.nav.chats },
  { id: 'profiles', href: 'profiles', icon: 'usersSolid', label: t.nav.profiles },
  { id: 'ads', href: 'ads', icon: 'megaphoneSolid', label: t.nav.ads },
]

export function TabRail({
  community,
  communityName,
  userId,
  username,
}: {
  community: string
  communityName: string
  userId: string | null
  username: string | null
}) {
  const path = usePathname()
  const [open, setOpen] = useState(true)
  const active = path.includes('/profiles') ? 'profiles' : path.includes('/ads') ? 'ads' : 'chats'
  const row = `flex h-10 items-center gap-3 rounded-lg text-[15px] font-semibold ${open ? 'px-3' : 'w-11 justify-center'}`

  return (
    <nav
      aria-label={t.nav.label}
      className={`sticky top-0 hidden h-dvh flex-col border-r border-black/10 bg-rail py-4 transition-[width] duration-200 rail:flex ${
        open ? 'w-60 px-3' : 'w-[4.5rem] items-center'
      }`}
    >
      {userId && username ? (
        <Link
          href={`/${community}/profiles/${userId}`}
          aria-label={t.chats.yourProfile}
          className={`flex items-center gap-3 rounded-lg py-1 hover:bg-black/5 ${open ? 'px-1' : ''}`}
        >
          <Avatar name={username} seed={userId} size="sm" />
          {open ? (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-bold">{username}</span>
              <span className="block truncate text-[13px] text-muted">@{username.toLowerCase().replace(/\s+/g, '')}</span>
            </span>
          ) : null}
        </Link>
      ) : null}

      {open ? (
        <p className="mt-6 mb-1.5 truncate px-3 text-[12px] font-semibold tracking-wide text-muted uppercase">{communityName || t.nav.section}</p>
      ) : (
        <span className="mt-4" />
      )}
      <ul className={`grid gap-1 ${open ? '' : 'justify-items-center'}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === active
          return (
            <li key={tab.id}>
              <Link
                href={`/${community}/${tab.href}`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={open ? undefined : tab.label}
                title={open ? undefined : tab.label}
                className={`${row} ${isActive ? 'bg-accent text-white' : 'text-ink hover:bg-black/5'}`}
              >
                <Icon name={tab.icon} className="size-5 shrink-0" />
                {open ? tab.label : null}
              </Link>
            </li>
          )
        })}
      </ul>

      <div className={`mt-auto grid gap-1 ${open ? '' : 'justify-items-center'}`}>
        <LogoutButton community={community} withLabel={open} className={`${row} text-ink hover:bg-black/5`} />
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? undefined : t.common.expand}
          title={open ? undefined : t.common.expand}
          onClick={() => setOpen((value) => !value)}
          className={`${row} text-ink hover:bg-black/5`}
        >
          <Icon name={open ? 'chevronLeft' : 'chevronRight'} className="size-5 shrink-0" />
          {open ? t.common.collapse : null}
        </button>
      </div>
    </nav>
  )
}
