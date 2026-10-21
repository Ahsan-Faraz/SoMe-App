import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { RouteSkeleton } from '@/app/[community]/loading'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { getGroupInfo } from '@/features/groups/queries'
import { t } from '@/lib/i18n'

export default function InfoPostPage(props: PageProps<'/[community]/chats/[chatId]/info/[n]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <InfoPostContent {...props} />
    </Suspense>
  )
}

async function InfoPostContent({ params }: PageProps<'/[community]/chats/[chatId]/info/[n]'>) {
  const { community, chatId, n } = await params
  const viewer = await getViewer(community)
  if (!viewer) redirect(`/${community}/login`)
  if (viewer.role === 'pending') redirect(`/${community}/pending`)

  // B2: one of Info 1–3, from the same call as the group info (its members and admins only).
  const group = await getGroupInfo(community, chatId)
  const post = group?.infos.find((item) => String(item.n) === n)
  if (!group || !post) notFound()

  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader title={group.name} backHref={`/${community}/chats/${chatId}`} />
      <nav aria-label={t.groupInfo.info} className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5 sm:justify-center">
        {group.infos.map((item) => (
          <Link
            key={item.n}
            href={`/${community}/chats/${chatId}/info/${item.n}`}
            aria-current={item.n === post.n ? 'page' : undefined}
            className={`inline-flex h-9 shrink-0 items-center rounded-lg px-4 text-[15px] font-bold ${item.n === post.n ? 'bg-accent text-white' : 'hover:bg-hover'}`}
          >
            {item.headline}
          </Link>
        ))}
      </nav>
      <article className="mx-auto max-w-2xl px-5 py-8 sm:px-8">
        <h2 className="text-[28px] leading-tight font-bold">{post.headline}</h2>
        <div className="mt-5 space-y-4 text-[17px] leading-relaxed text-ink-soft">
          {post.body.split('\n\n').map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </article>
    </div>
  )
}
