import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { chatIdForUser } from '@/features/chats/queries'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { ProfileIcon } from '@/features/profiles/components/ProfileIcon'
import { ProfileActions, ProfileView } from '@/features/profiles/components/ProfileView'
import { t } from '@/lib/i18n'
import { getProfile } from '@/features/profiles/queries'
import { backFrom } from '@/lib/back'
import { RouteSkeleton } from '../../../loading'

export default function ProfilePage(props: PageProps<'/[community]/profiles/[userId]'>) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <ProfileContent {...props} />
    </Suspense>
  )
}

async function ProfileContent({ params, searchParams }: PageProps<'/[community]/profiles/[userId]'>) {
  const { community, userId } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/${community}/login`)

  const profile = await getProfile(userId, viewer.userId, viewer.username)
  if (!profile) notFound()

  const query = await searchParams
  const section = first(query.section)
  const backHref = backFrom(query.back, community, viewer.role === 'pending' ? `/${community}/pending` : `/${community}/profiles`)

  const chatId = profile.own ? null : chatIdForUser(profile.id)
  const self = `/${community}/profiles/${profile.id}`

  return (
    <div className="flex min-h-dvh w-full flex-col bg-canvas lg:min-h-full">
      <ScreenHeader
        title={profile.username}
        backHref={backHref}
        leading={<ProfileIcon community={community} userId={profile.id} name={profile.username} own={profile.own} />}
        right={
          profile.own ? undefined : (
            <Link href={`${self}/notes?back=${encodeURIComponent(self)}`} aria-label={t.profiles.notes} title={t.profiles.notes} className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover">
              <Icon name="star" className="size-6" />
            </Link>
          )
        }
      />
      <div className="flex-1">
        <ProfileView community={community} profile={profile} section={section} />
      </div>
      <ProfileActions community={community} profile={profile} chatId={chatId} isAdmin={viewer.role === 'admin'} />
    </div>
  )
}

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}
