import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'

function Step({ number, label, href }: { number: number; label: string; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 border-b border-line py-4 hover:bg-sunken"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-white">
          {number}
        </span>
        <span className="flex-1 text-base font-semibold">{label}</span>
        <Icon name="chevronRight" className="size-5 text-muted" />
      </Link>
    </li>
  )
}

export function PendingSteps({ profileHref, adminChatHref }: { profileHref: string; adminChatHref: string }) {
  return (
    <div className="grid gap-6">
      <p className="leading-relaxed text-ink-soft">{t.pending.intro}</p>
      <ol>
        <Step number={1} label={t.pending.stepProfile} href={profileHref} />
        <Step number={2} label={t.pending.stepChat} href={adminChatHref} />
      </ol>
    </div>
  )
}
