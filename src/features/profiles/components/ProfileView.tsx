import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'
import { ThemePicker } from '@/components/ThemePicker'
import { Icon, type IconName } from '@/components/ui/Icon'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
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
}: {
  community: string
  profile: Profile
  chatId: string | null
  isAdmin: boolean
  section: string | null
}) {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-5 pb-12 sm:px-8 min-[52rem]:grid min-[52rem]:grid-cols-2 min-[52rem]:items-start min-[52rem]:gap-x-14 min-[52rem]:px-12 min-[52rem]:pt-8">
      <div>
        <Photos verified={profile.lastLogin} community={community} userId={profile.id} own={profile.own} />
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
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line min-[52rem]:grid min-[52rem]:grid-cols-3 min-[52rem]:divide-x min-[52rem]:divide-y-0">
          <ActionRow href={`/${community}/profiles/${profile.id}/notes`} icon="note" label={t.profiles.notes} />
          <ActionRow href={`/${community}/profiles/${profile.id}/albums`} icon="image" label={t.profiles.albums} />
          <ActionRow href={`/${community}/profiles/${profile.id}/ads`} icon="megaphone" label={t.profiles.ads} />
        </ul>
        {isAdmin && !profile.own ? (
          <Link href={`/${community}/profiles/${profile.id}/groups`} className="mt-5 flex h-14 items-center gap-3 rounded-2xl border border-line px-4 text-[16px] font-semibold hover:bg-hover">
            <Icon name="users" className="size-5 shrink-0" />
            <span className="flex-1">{t.profiles.addToGroups}</span>
            <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
          </Link>
        ) : null}
        {profile.own ? <ThemePicker className="mt-6 min-[52rem]:max-w-sm" /> : null}
        {profile.own ? (
          <LogoutButton
            community={community}
            withLabel
            className="mt-5 flex h-14 w-full items-center gap-3 rounded-2xl border border-line px-4 text-left text-[16px] font-semibold text-danger hover:bg-hover min-[52rem]:max-w-xs"
          />
        ) : null}
      </div>
    </main>
  )
}

function ActionRow({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <li>
      <Link href={href} className="flex h-14 items-center gap-3 px-4 text-[16px] font-semibold hover:bg-hover">
        <Icon name={icon} className="size-5 shrink-0" />
        <span className="flex-1">{label}</span>
        <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
      </Link>
    </li>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  )
}
