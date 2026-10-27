import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { Directory } from '@/features/chats/components/Directory'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { cardLabels } from '@/features/profiles/cards'
import { t } from '@/lib/i18n'
import { RouteSkeleton } from '../../../loading'

export default function NewChatPage(props: PageProps<'/[community]/chats/new'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <NewChatContent {...props} />
    </Suspense>
  )
}

async function NewChatContent({ params }: PageProps<'/[community]/chats/new'>) {
  const { community } = await params
  const [viewer, info] = await Promise.all([getViewer(community), getCommunity(community)])
  if (!viewer || !info) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  // Nothing to load until a name is typed: the search runs on the phone (find_new).
  const schema = await getProfileSchema(info.id)

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={t.chats.joinTitle} backHref={`/${community}/chats`} />
      <Directory community={community} communityId={info.id} labels={cardLabels(schema)} />
    </div>
  )
}
