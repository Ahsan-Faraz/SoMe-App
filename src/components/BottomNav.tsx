import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'

type Tab = 'chats' | 'profiles' | 'ads'

const tabs: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'chats', icon: 'chatSolid', label: t.nav.chats },
  { id: 'profiles', icon: 'usersSolid', label: t.nav.profiles },
  { id: 'ads', icon: 'megaphoneSolid', label: t.nav.ads },
]

export function BottomNav({ community, active }: { community: string; active: Tab }) {
  return (
    <nav
      aria-label={t.nav.label}
      className="fixed inset-x-0 bottom-0 z-10 border-t border-black/10 bg-canvas pb-[env(safe-area-inset-bottom)] rail:hidden"
    >
      <ul className="grid grid-cols-3">
        {tabs.map((tab) => {
          const isActive = tab.id === active
          return (
            <li key={tab.id}>
              <Link
                href={`/${community}/${tab.id}`}
                aria-current={isActive ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-semibold ${isActive ? 'text-accent' : 'text-ink'}`}
              >
                <span className={`grid h-8 w-12 place-items-center rounded-full ${isActive ? 'bg-accent text-white' : ''}`}>
                  <Icon name={tab.icon} className="size-5" />
                </span>
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
