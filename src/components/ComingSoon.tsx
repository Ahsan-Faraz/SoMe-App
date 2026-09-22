import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { t } from '@/lib/i18n'

export function ComingSoon({ title, backHref }: { title: string; backHref?: string }) {
  return (
    <>
      <ScreenHeader title={title} backHref={backHref} />
      <main className="mx-auto max-w-md px-6 py-16 text-center text-neutral-500">{t.common.comingSoon}</main>
    </>
  )
}
