import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { t } from '@/lib/i18n'

export function ComingSoon({ title, backHref }: { title: string; backHref?: string }) {
  return (
    <>
      <ScreenHeader title={title} backHref={backHref} />
      <main className="w-full bg-canvas px-6 py-16 text-center text-muted">{t.common.comingSoon}</main>
    </>
  )
}
