import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireAdmin } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { FieldEditor } from '@/features/fields/components/FieldEditor'
import { getProfileSchema } from '@/features/fields/queries'
import { t } from '@/lib/i18n'

export default function NewFieldPage(props: PageProps<'/[community]/admin/fields/new'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params }: PageProps<'/[community]/admin/fields/new'>) {
  const { community } = await params
  const [, info] = await Promise.all([requireAdmin(community), getCommunity(community)])
  if (!info) notFound()
  const schema = await getProfileSchema(info.id)

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.builder.newField} backHref={`/${community}/admin/fields`} />
      <FieldEditor community={community} field={null} statuses={schema.statuses} substatuses={schema.substatuses} />
    </div>
  )
}
