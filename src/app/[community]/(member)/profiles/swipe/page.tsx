import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { BrowseProfiles } from '@/features/profiles/components/BrowseProfiles'
import { filterKey } from '@/features/profiles/filter'
import { searchProfiles } from '@/features/profiles/queries'

// A27: browse profiles one at a time ("swipe interface").
export default function SwipePage(props: PageProps<'/[community]/profiles/swipe'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <SwipeContent {...props} />
    </Suspense>
  )
}

async function SwipeContent({ params }: PageProps<'/[community]/profiles/swipe'>) {
  const { community } = await params
  const [viewer, info] = await Promise.all([getViewer(community), getCommunity(community)])
  if (!viewer || !info) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  const [search, schema] = await Promise.all([searchProfiles(community), getProfileSchema(info.id)])
  if (!search) redirect(`/${community}/login`)

  return (
    <BrowseProfiles
      // A new saved filter starts over at the first profile.
      key={filterKey(search.filter)}
      community={community}
      search={search}
      statuses={schema.statuses}
      substatuses={schema.substatuses}
      builtins={schema.builtins}
      layout={schema.layout}
      fields={schema.fields.filter((field) => field.active)}
    />
  )
}
