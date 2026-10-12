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

// The Status or District list (D2).
export default function ChoiceListPage(props: PageProps<'/[community]/admin/lists/[list]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params }: PageProps<'/[community]/admin/lists/[list]'>) {
  const { community, list: param } = await params
  const list = CHOICE_LISTS.find((item) => item === param)
  if (!list) notFound()
  const [, info] = await Promise.all([requireAdmin(community), getCommunity(community)])
  if (!info) notFound()
  const schema = await getProfileSchema(info.id)
  const choices = list === 'status' ? schema.statuses : schema.districts

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={list === 'status' ? t.builder.statusList : t.builder.districtList} backHref={`/${community}/admin/fields`} />
      {/* The form is a draft of the saved list: a newer save opens a fresh form. */}
      <ListEditor key={JSON.stringify(choices)} community={community} list={list} choices={choices} />
    </div>
  )
}
