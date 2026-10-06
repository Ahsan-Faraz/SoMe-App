import Link from 'next/link'
import { Icon, type IconName } from './Icon'

// Full-width row button for admin menus (A19, group settings).
export function BigLink({ href, icon, label, detail }: { href: string; icon: IconName; label: string; detail?: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line px-4 py-2 text-[16px] font-semibold hover:bg-hover">
      <Icon name={icon} className="size-5 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? <span className="shrink-0 text-[14px] font-semibold text-muted">{detail}</span> : null}
      <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
    </Link>
  )
}
