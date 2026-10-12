import Link from 'next/link'
import type { ReactNode } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { bottomBar } from '@/components/ui/Screen'
import { dmHref } from '@/features/chats/links'
import { t } from '@/lib/i18n'
import type { Profile } from '../types'

// A3/B1 bottom bar — fixed, not scrolling: DM (not on your own profile), then Albums · + · Ads.
// DM opens the existing DM, or starts one (so an admin can always write to an applicant).
// "+" = add this person to groups, admins only.
export function ProfileActions({
  community,
  profile,
  chatId,
  isAdmin,
  top,
}: {
  community: string
  profile: Pick<Profile, 'id' | 'username' | 'own'>
  chatId: string | null
  isAdmin: boolean
  // A21/A22: Approve sits above DM.
  top?: ReactNode
}) {
  const base = `/${community}/profiles/${profile.id}`
  return (
    <nav aria-label={profile.username} className={bottomBar}>
      <div className="mx-auto grid max-w-xl gap-2">
        {top}
        {profile.own ? null : (
          <Link href={dmHref(community, profile.id, chatId)} className={buttonClass('primary')}>
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
