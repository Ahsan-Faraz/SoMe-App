import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'

type Tab = 'chats' | 'profiles' | 'ads'

const tabs: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'chats', icon: 'chat', label: t.nav.chats },
  { id: 'profiles', icon: 'users', label: t.nav.profiles },
  { id: 'ads', icon: 'megaphone', label: t.nav.ads },
]

export function BottomNav({ community, active }: { community: string; active: Tab }) {
  return (
    <nav
      aria-label={t.nav.label}
      className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {tabs.map((tab) => {
          const isActive = tab.id === active
          return (
            <li key={tab.id}>
              <Link
                href={`/${community}/${tab.id}`}
                aria-current={isActive ? 'page' : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  isActive ? 'text-accent' : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                <Icon name={tab.icon} className="size-6" />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
