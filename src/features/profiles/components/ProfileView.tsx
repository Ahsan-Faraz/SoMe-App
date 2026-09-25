import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import type { Profile } from '../types'
import { Photos } from './Photos'
import { ProfileFields } from './ProfileFields'

export function ProfileView({
  community,
  profile,
  chatId,
  isAdmin,
  section,
  groups,
}: {
  community: string
  profile: Profile
  chatId: string | null
  isAdmin: boolean
  section: string | null
  groups: { id: string; name: string }[]
}) {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-5 pb-12 sm:px-8 min-[52rem]:grid min-[52rem]:grid-cols-2 min-[52rem]:items-start min-[52rem]:gap-x-14 min-[52rem]:px-12 min-[52rem]:pt-8">
      <div>
        <Photos verified={profile.lastLogin} />
        <p className="mt-4 text-[14px] text-muted">
          {t.profiles.latestLogin}: <span className="font-semibold text-ink">{profile.lastLogin}</span>
        </p>
        <dl className="mt-3 grid text-[16px]">
          <Row label={t.profiles.age} value={String(profile.age)} />
          <Row label={t.profiles.district} value={profile.district} />
          <Row label={t.profiles.place} value={profile.place} />
        </dl>
      </div>
      <ProfileFields own={profile.own} about={profile.about} status={profile.status} headline={profile.headline} />
      <div className="mt-8 min-[52rem]:col-span-2">
        {section ? <p className="mb-4 rounded-xl bg-rail px-4 py-3 text-[16px] font-semibold">{section}</p> : null}
        {profile.own || !chatId ? null : (
          <Link href={`/${community}/chats/${chatId}`} className={`${buttonClass('primary')} mb-4 min-[52rem]:max-w-xs`}>
            <Icon name="chatSolid" className="mr-2 size-5" />
            {t.profiles.dm}
          </Link>
        )}
        <ul className="divide-y divide-black/10 overflow-hidden rounded-2xl border border-black/10 min-[52rem]:grid min-[52rem]:grid-cols-3 min-[52rem]:divide-x min-[52rem]:divide-y-0">
          <ActionRow href={`/${community}/profiles/${profile.id}/notes`} icon="note" label={t.profiles.notes} />
          <ActionRow href={`/${community}/profiles/${profile.id}?section=${t.profiles.albums}`} icon="image" label={t.profiles.albums} />
          <ActionRow href={`/${community}/ads`} icon="megaphone" label={t.profiles.ads} />
        </ul>
        {isAdmin && !profile.own ? (
          <details className="mt-5">
            <summary className="cursor-pointer text-[16px] font-semibold text-accent">{t.profiles.addToGroups}</summary>
            <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-1">
              {groups.map((group) => (
                <li key={group.id}>
                  <Link href={`/${community}/groups/${group.id}/add`} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-black/5">
                    {group.name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </main>
  )
}

function ActionRow({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <li>
      <Link href={href} className="flex h-14 items-center gap-3 px-4 text-[16px] font-semibold hover:bg-black/[0.04]">
        <Icon name={icon} className="size-5 shrink-0" />
        <span className="flex-1">{label}</span>
        <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
      </Link>
    </li>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-black/10 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  )
}
