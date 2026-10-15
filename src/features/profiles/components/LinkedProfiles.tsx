import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import type { LinkedProfile } from '../types'

// Linked profiles on a profile. Your own list is edited on A32 (Add profiles).
// A link is confirmed once the other person links back to you. On your own profile an unconfirmed
// link is dimmed; everyone else only ever gets confirmed links (the database leaves the rest out).
// canEdit: approved members only (applicants can't link yet).
export function LinkedProfiles({
  community,
  userId,
  own,
  canEdit,
  linked,
  linkBase,
}: {
  community: string
  userId: string
  own: boolean
  canEdit: boolean
  linked: LinkedProfile[]
  linkBase: string
}) {
  if ((!own || !canEdit) && linked.length === 0) return null

  return (
    <section className="mt-5">
      <h2 className="text-[14px] font-semibold text-ink">{t.profiles.linked}</h2>
      {linked.length === 0 ? <p className="mt-1 text-[15px] text-muted">{t.profiles.linkedNone}</p> : null}
      <ul className="mt-2 grid gap-1">
        {linked.map((item) => (
          <li key={item.id}>
            <Link href={`${linkBase}/${item.id}`} className={`flex items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-hover ${item.confirmed ? '' : 'opacity-50'}`}>
              <Avatar name={item.username} seed={item.id} size="sm" src={item.icon} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{item.username}</span>
                {item.confirmed ? null : <span className="block truncate text-[13px] text-muted">{t.linked.waiting}</span>}
              </span>
              <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      {own && linked.some((item) => !item.confirmed) ? <p className="mt-1 text-[13px] text-muted">{t.linked.waitingHint}</p> : null}
      {own && canEdit ? (
        <Link href={`/${community}/profiles/${userId}/linked`} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-soft px-3 text-[15px] font-semibold hover:bg-soft-hover">
          <Icon name="plus" className="size-4" />
          {t.linked.edit}
        </Link>
      ) : null}
    </section>
  )
}
