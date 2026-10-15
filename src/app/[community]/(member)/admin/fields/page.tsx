import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { BigLink } from '@/components/ui/BigLink'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireAdmin } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { BuiltinsForm } from '@/features/fields/components/BuiltinsForm'
import { FieldList } from '@/features/fields/components/FieldList'
import { getProfileSchema } from '@/features/fields/queries'
import { t } from '@/lib/i18n'

// Profile builder (community admin): the lists, the basic fields shown, then the fields in order.
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
          <BigLink href={`${base}/lists/status`} icon="users" label={t.builder.lists.status} detail={active(schema.statuses)} />
          <BigLink href={`${base}/lists/substatus`} icon="users" label={t.builder.lists.substatus} detail={active(schema.substatuses)} />
          <BigLink href={`${base}/lists/country`} icon="info" label={t.builder.lists.country} detail={active(schema.countries)} />
          {/* Districts are kept per country. */}
          {schema.countries
            .filter((country) => country.active)
            .map((country) => (
              <BigLink
                key={country.id}
                href={`${base}/lists/district?country=${country.id}`}
                icon="info"
                label={t.builder.districtsIn(country.label)}
                detail={active(schema.districts.filter((district) => district.countryId === country.id))}
              />
            ))}
        </nav>
        <BuiltinsForm community={community} builtins={schema.builtins} />
        <section className="grid grid-cols-1 gap-3">
          <h2 className="text-[13px] font-bold tracking-wide text-muted uppercase">{t.builder.order}</h2>
          <p className="text-[14px] text-ink-soft">{t.builder.orderHint}</p>
          <FieldList
            community={community}
            layout={schema.layout}
            fields={schema.fields}
            statuses={schema.statuses}
            substatuses={schema.substatuses}
            builtins={schema.builtins}
          />
          <Link href={`${base}/fields/new`} className="flex h-11 items-center gap-2 justify-self-start rounded-full px-3 text-[15px] font-semibold text-accent hover:bg-hover">
            <Icon name="plus" className="size-5" />
            {t.builder.addField}
          </Link>
        </section>
      </div>
    </div>
  )
}
