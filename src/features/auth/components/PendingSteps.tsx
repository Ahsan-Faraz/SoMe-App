import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'

function Step({ number, label, href }: { number: number; label: string; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 transition-colors hover:border-accent"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-lg font-semibold text-white">
          {number}
        </span>
        <span className="flex-1 text-base font-semibold">{label}</span>
        <Icon name="chevronRight" className="size-5 text-neutral-400" />
      </Link>
    </li>
  )
}

export function PendingSteps({ profileHref, adminChatHref }: { profileHref: string; adminChatHref: string }) {
  return (
    <div className="grid gap-6">
      <p className="rounded-2xl bg-accent-soft p-4 leading-relaxed text-neutral-800">{t.pending.intro}</p>
      <ol className="grid gap-3">
        <Step number={1} label={t.pending.stepProfile} href={profileHref} />
        <Step number={2} label={t.pending.stepChat} href={adminChatHref} />
      </ol>
    </div>
  )
}
