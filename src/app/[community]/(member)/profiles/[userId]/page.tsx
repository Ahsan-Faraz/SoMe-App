import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { Screen } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { getViewer } from '@/features/auth/queries'
import { chatIdForUser } from '@/features/chats/queries'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { ProfileIcon } from '@/features/profiles/components/ProfileIcon'
import { ProfileActions } from '@/features/profiles/components/ProfileActions'
import { ProfileView } from '@/features/profiles/components/ProfileView'
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
  const [viewer, info] = await Promise.all([getViewer(community), getCommunity(community)])
  if (!viewer || !info) redirect(`/${community}/login`)

  const [profile, schema] = await Promise.all([getProfile(community, userId), getProfileSchema(info.id)])
  if (!profile) {
    // Applicants see only their own profile (the database returns no other): back to their application.
    if (viewer.role === 'pending') redirect(`/${community}/pending`)
    notFound()
  }

  const query = await searchParams
  const section = first(query.section)
  const backHref = backFrom(query.back, community, viewer.role === 'pending' ? `/${community}/pending` : `/${community}/profiles`)

  const chatId = profile.own ? null : chatIdForUser(profile.id)
  const self = `/${community}/profiles/${profile.id}`

  return (
    <Screen
      header={
        <ScreenHeader
          title={profile.username}
          backHref={backHref}
          leading={<ProfileIcon name={profile.username} userId={profile.id} icon={schema.builtins.photo ? profile.photo : null} owner={profile.own && schema.builtins.photo ? { slug: community, communityId: info.id, userId: profile.id } : null} />}
          right={
            profile.own ? undefined : (
              <Link
                href={`${self}/notes?back=${encodeURIComponent(self)}`}
                aria-label={t.profiles.notes}
                title={t.profiles.notes}
                className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-hover"
              >
                <Icon name="star" className="size-6" />
              </Link>
            )
          }
        />
      }
      footer={<ProfileActions community={community} profile={profile} chatId={chatId} isAdmin={viewer.role === 'admin'} />}
    >
      <ProfileView community={community} communityId={info.id} profile={profile} schema={schema} section={section} />
    </Screen>
  )
}

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}
