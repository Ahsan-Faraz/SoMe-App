import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { SiteCommunity } from '../queries'

// /communities (client guide 261123): your communities on this domain, then the visible ones you can
// join. Joining opens that community's Join page, which (logged in) asks only for a username there
// and the consents, then goes on to the usual application.
export function CommunityChooser({ communities }: { communities: SiteCommunity[] }) {
  const mine = communities.filter((community) => community.state)
  const others = communities.filter((community) => !community.state)

  return (
    <div className="grid gap-10">
      <section>
        <h3 className="mb-3 text-[13px] font-bold tracking-wide text-muted uppercase">{t.site.mine}</h3>
        {mine.length ? (
          <ul className="grid gap-3">
            {mine.map((community) => (
              <Row
                key={community.slug}
                community={community}
                href={`/${community.slug}/${community.state === 'approved' ? 'chats' : 'pending'}`}
                action={community.state === 'approved' ? t.site.open : t.site.pending}
                primary={community.state === 'approved'}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-sunken p-4 text-[15px] text-ink-soft">{t.site.noneMine}</p>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-[13px] font-bold tracking-wide text-muted uppercase">{t.site.others}</h3>
        {others.length ? (
          <ul className="grid gap-3">
            {others.map((community) => (
              <Row key={community.slug} community={community} href={`/${community.slug}/join`} action={t.site.join} primary />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-sunken p-4 text-[15px] text-ink-soft">{t.site.noneOthers}</p>
        )}
      </section>
    </div>
  )
}

function Row({ community, href, action, primary }: { community: SiteCommunity; href: string; action: string; primary: boolean }) {
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-line bg-canvas p-4">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-bold">{community.name}</span>
        {community.headline ? <span className="line-clamp-2 text-[14px] text-ink-soft">{community.headline}</span> : null}
      </span>
      <Link href={href} className={`${buttonClass(primary ? 'primary' : 'secondary')} h-10! w-auto! shrink-0 px-4`}>
        {action}
      </Link>
    </li>
  )
}
