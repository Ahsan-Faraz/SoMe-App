import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { requireAdmin } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { FieldEditor } from '@/features/fields/components/FieldEditor'
import { getProfileSchema } from '@/features/fields/queries'
import { t } from '@/lib/i18n'

export default function EditFieldPage(props: PageProps<'/[community]/admin/fields/[fieldId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Content {...props} />
    </Suspense>
  )
}

async function Content({ params }: PageProps<'/[community]/admin/fields/[fieldId]'>) {
  const { community, fieldId } = await params
  const [, info] = await Promise.all([requireAdmin(community), getCommunity(community)])
  if (!info) notFound()
  const schema = await getProfileSchema(info.id)
  const field = schema.fields.find((item) => item.id === fieldId)
  if (!field) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.builder.editField} backHref={`/${community}/admin/fields`} />
      {/* The form is a draft of the saved field: a newer save (from any screen) opens a fresh form. */}
      <FieldEditor key={JSON.stringify(field)} community={community} field={field} statuses={schema.statuses} />
    </div>
  )
}
