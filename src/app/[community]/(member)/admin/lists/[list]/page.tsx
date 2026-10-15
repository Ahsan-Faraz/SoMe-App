import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireAdmin } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { ListEditor } from '@/features/fields/components/ListEditor'
import { getProfileSchema } from '@/features/fields/queries'
import { CHOICE_LISTS } from '@/features/fields/types'
import { t } from '@/lib/i18n'

// One of the community's lists (D2): Status (with its people), Substatus, Country, or the
// Districts of one country (?country=).
export default function ChoiceListPage(props: PageProps<'/[community]/admin/lists/[list]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params, searchParams }: PageProps<'/[community]/admin/lists/[list]'>) {
  const { community, list: param } = await params
  const list = CHOICE_LISTS.find((item) => item === param)
  if (!list) notFound()
  const [, info] = await Promise.all([requireAdmin(community), getCommunity(community)])
  if (!info) notFound()
  const schema = await getProfileSchema(info.id)

  const countryParam = (await searchParams).country
  const country = list === 'district' ? schema.countries.find((item) => item.id === countryParam) : undefined
  if (list === 'district' && !country) notFound()

  const choices =
    list === 'status' ? schema.statuses : list === 'substatus' ? schema.substatuses : list === 'country' ? schema.countries : schema.districts.filter((item) => item.countryId === country?.id)
  const title = country ? t.builder.districtsIn(country.label) : t.builder.lists[list]

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={title} backHref={`/${community}/admin/fields`} />
      {/* The form is a draft of the saved list: a newer save opens a fresh form. */}
      <ListEditor
        key={JSON.stringify(choices)}
        community={community}
        list={list}
        choices={choices}
        substatuses={schema.substatuses}
        countryId={country?.id ?? null}
      />
    </div>
  )
}
