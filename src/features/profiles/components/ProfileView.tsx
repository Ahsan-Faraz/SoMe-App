import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'
import { bottomBar } from '@/components/ui/Screen'
import { ThemePicker } from '@/components/ThemePicker'
import { Icon } from '@/components/ui/Icon'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { t } from '@/lib/i18n'
import type { Profile } from '../types'
import { Photos } from './Photos'
import { ProfileFields } from './ProfileFields'

export function ProfileView({
  community,
  profile,
  section,
}: {
  community: string
  profile: Profile
  section: string | null
}) {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-5 pb-12 sm:px-8 min-[52rem]:grid min-[52rem]:grid-cols-2 min-[52rem]:items-start min-[52rem]:gap-x-14 min-[52rem]:px-12 min-[52rem]:pt-8">
      <div>
        <Photos main={profile.photo} community={community} userId={profile.id} own={profile.own} />
        <p className="mt-4 text-[14px] text-muted">
          {t.profiles.latestLogin}: <span className="font-semibold text-ink">{profile.lastLogin}</span>
        </p>
        <dl className="mt-3 grid text-[16px]">
          <Row label={t.profiles.score} value={String(profile.score)} />
          <Row label={t.profiles.reputation} value={String(profile.reputation)} />
          <Row label={t.profiles.age} value={String(profile.age)} />
          <Row label={t.profiles.district} value={profile.district} />
          <Row label={t.profiles.place} value={profile.place} />
        </dl>
      </div>
      <ProfileFields own={profile.own} about={profile.about} status={profile.status} headline={profile.headline} />
      {section || profile.own ? (
        <div className="mt-8 min-[52rem]:col-span-2">
          {section ? <p className="mb-4 rounded-xl bg-rail px-4 py-3 text-[16px] font-semibold">{section}</p> : null}
          {profile.own ? <ThemePicker className="min-[52rem]:max-w-sm" /> : null}
          {profile.own ? (
            <LogoutButton
              community={community}
              withLabel
              className="mt-5 flex h-14 w-full items-center gap-3 rounded-2xl border border-line px-4 text-left text-[16px] font-semibold text-danger hover:bg-hover min-[52rem]:max-w-xs"
            />
          ) : null}
        </div>
      ) : null}
    </main>
  )
}

// A3/B1 bottom bar — fixed, not scrolling: DM (not on your own profile), then Albums · + · Ads.
// "+" = add this person to groups, admins only.
export function ProfileActions({ community, profile, chatId, isAdmin }: { community: string; profile: Profile; chatId: string | null; isAdmin: boolean }) {
  const base = `/${community}/profiles/${profile.id}`
  return (
    <nav aria-label={profile.username} className={bottomBar}>
      <div className="mx-auto grid max-w-xl gap-2">
        {profile.own || !chatId ? null : (
          <Link href={`/${community}/chats/${chatId}`} className={buttonClass('primary')}>
            <Icon name="chatSolid" className="mr-2 size-5" />
            {t.profiles.dm}
          </Link>
        )}
        <div className="flex items-center gap-2">
          <Link href={`${base}/albums`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-rail text-[16px] font-semibold hover:bg-soft-hover">
            <Icon name="image" className="size-5" />
            {t.profiles.albums}
          </Link>
          {isAdmin && !profile.own ? (
            <Link href={`${base}/groups`} aria-label={t.profiles.addToGroups} title={t.profiles.addToGroups} className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white hover:bg-accent-hover">
              <Icon name="plus" className="size-5" />
            </Link>
          ) : null}
          <Link href={`${base}/ads`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-rail text-[16px] font-semibold hover:bg-soft-hover">
            <Icon name="megaphone" className="size-5" />
            {t.profiles.ads}
          </Link>
        </div>
      </div>
    </nav>
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
