import { Suspense } from 'react'
import { TabRail } from '@/components/TabRail'
import { getViewer } from '@/features/auth/queries'
import { getCommunity } from '@/features/communities/queries'

export default function MemberLayout({ children, params }: LayoutProps<'/[community]'>) {
  return (
    <div className="min-h-dvh w-full bg-canvas rail:grid rail:h-dvh rail:grid-cols-[auto_minmax(0,1fr)] rail:overflow-hidden">
      <Suspense fallback={<div className="hidden rail:block" />}>
        <MemberNav params={params} />
      </Suspense>
      <div className="min-h-dvh min-w-0 rail:h-dvh rail:overflow-y-auto">{children}</div>
    </div>
  )
}

async function MemberNav({ params }: { params: LayoutProps<'/[community]'>['params'] }) {
  const { community } = await params
  const [viewer, info] = await Promise.all([getViewer(), getCommunity(community)])
  return (
    <TabRail
      community={community}
      communityName={info?.name ?? ''}
      userId={viewer?.userId ?? null}
      username={viewer?.username ?? null}
    />
  )
}
