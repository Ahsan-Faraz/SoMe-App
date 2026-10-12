import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { BigLink } from '@/components/ui/BigLink'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireAdmin } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { FieldList } from '@/features/fields/components/FieldList'
import { getProfileSchema } from '@/features/fields/queries'
import { t } from '@/lib/i18n'

// Profile builder (community admin): the Status and District lists, then the fields in order.
export default function ProfileBuilderPage(props: PageProps<'/[community]/admin/fields'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params }: PageProps<'/[community]/admin/fields'>) {
  const { community } = await params
  const [, info] = await Promise.all([requireAdmin(community), getCommunity(community)])
  if (!info) notFound()
  const schema = await getProfileSchema(info.id)
  const base = `/${community}/admin`
  const active = (list: readonly { active: boolean }[]) => String(list.filter((item) => item.active).length)

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader
        title={t.builder.title}
        backHref={base}
        right={
          <Link href={`${base}/fields/new`} aria-label={t.builder.addField} title={t.builder.addField} className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover">
            <Icon name="plus" className="size-6" />
          </Link>
        }
      />
      <div className="mx-auto grid max-w-xl grid-cols-1 gap-6 px-4 py-6 sm:px-8">
        <nav aria-label={t.builder.title} className="grid grid-cols-1 gap-2">
          <BigLink href={`${base}/lists/status`} icon="users" label={t.builder.statusList} detail={active(schema.statuses)} />
          <BigLink href={`${base}/lists/district`} icon="info" label={t.builder.districtList} detail={active(schema.districts)} />
        </nav>
        <section className="grid grid-cols-1 gap-3">
          <h2 className="text-[13px] font-bold tracking-wide text-muted uppercase">{t.builder.fields}</h2>
          <FieldList community={community} fields={schema.fields} statuses={schema.statuses} />
          <Link href={`${base}/fields/new`} className="flex h-11 items-center gap-2 justify-self-start rounded-full px-3 text-[15px] font-semibold text-accent hover:bg-hover">
            <Icon name="plus" className="size-5" />
            {t.builder.addField}
          </Link>
        </section>
      </div>
    </div>
  )
}
