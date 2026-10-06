import { notFound } from 'next/navigation'
import { Screen } from '@/components/ui/Screen'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import type { Viewer } from '@/features/auth/types'
import { chatIdForUser } from '@/features/chats/queries'
import { ProfileActions } from '@/features/profiles/components/ProfileActions'
import { ProfileView } from '@/features/profiles/components/ProfileView'
import { getProfile } from '@/features/profiles/queries'
import { getMemberRecord } from '../queries'
import type { Scope } from '../types'
import { ApproveButton, MemberPanel } from './MemberPanel'
import { ScopeTitle } from './RosterScreen'

// A21 (community admin) / A22 (group admin): the usual profile, then this scope's application
// and member data, then Approve while it is an application. Linked profiles open this same view.
export async function MemberProfileScreen({
  community,
  viewer,
  scope,
  userId,
  base,
  backHref,
}: {
  community: string
  viewer: Viewer
  scope: Scope
  userId: string
  base: string // this screen's path without the user id
  backHref: string
}) {
  const [profile, record] = await Promise.all([getProfile(userId, viewer.userId, viewer.username), getMemberRecord(scope, userId)])
  if (!profile) notFound()

  const scopeRef = { kind: scope.kind, id: scope.id, stateLabels: scope.stateLabels }
  const chatId = profile.own ? null : chatIdForUser(profile.id)

  return (
    <Screen
      header={<ScreenHeader title={<ScopeTitle scope={scope.name} title={profile.username} />} backHref={backHref} />}
      footer={
        <ProfileActions
          community={community}
          profile={profile}
          chatId={chatId}
          isAdmin
          top={record ? <ApproveButton community={community} scope={scopeRef} seed={record} /> : null}
        />
      }
    >
      <ProfileView
        community={community}
        profile={profile}
        section={null}
        linkBase={base}
        admin={record ? <MemberPanel community={community} scope={scopeRef} seed={record} /> : null}
      />
    </Screen>
  )
}
