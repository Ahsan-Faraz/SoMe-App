import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'

// A6 / C9: publish your own ad, in the header next to filter.
export function PublishAdLink({ community }: { community: string }) {
  return (
    <Link href={`/${community}/ads/new`} aria-label={t.ads.publish} title={t.ads.publish} className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover">
      <Icon name="plus" />
    </Link>
  )
}
