import 'server-only'
import { cache } from 'react'
import { getCommunity } from '@/features/communities/queries'
import { getGroup } from '@/features/groups/queries'
import { mockApplicants, mockApplications, mockCommunitySettings, mockGroupMembers, mockMemberState, mockProfiles, mockRealNames } from '@/mocks/data'
import { STATE_FIELDS, type MemberRecord, type Roster, type Scope, type ScopeKind } from './types'

const everyone = [...mockProfiles, ...mockApplicants]

// cache(): a page and its header both ask for the scope in one request.
export const getScope = cache(async (kind: ScopeKind, community: string, groupId = ''): Promise<Scope | null> => {
  if (kind === 'community') {
    const found = await getCommunity(community)
    return found ? { kind, id: 'community', name: found.name, ...mockCommunitySettings } : null
  }
  const group = await getGroup(groupId)
  if (!group) return null
  return {
    kind,
    id: group.id,
    name: group.name,
    stateLabels: group.stateLabels,
    applicationText: group.applicationText,
    requires: { image: group.applyImage, text: group.applyText, names: group.applyNames },
  }
})

function record(scopeId: string, userId: string, applied: boolean): MemberRecord | null {
  const profile = everyone.find((item) => item.id === userId)
  if (!profile) return null
  const saved = mockMemberState[scopeId]?.[userId]
  const application = mockApplications[scopeId]?.find((item) => item.userId === userId)
  return {
    userId,
    username: profile.username,
    status: profile.status,
    realNames: mockRealNames[userId] ?? [],
    state: saved?.state ?? Array.from({ length: STATE_FIELDS }, () => ''),
    notes: saved?.notes ?? '',
    image: application?.image ?? null,
    message: application?.message ?? '',
    applied,
  }
}

// Sorted by profile name (the only sort order for now).
export const listRoster = cache(async (scope: Scope): Promise<Roster> => {
  const memberIds = scope.kind === 'community' ? mockProfiles.map((profile) => profile.id) : (mockGroupMembers[scope.id] ?? [])
  const byName = (a: MemberRecord, b: MemberRecord) => a.username.localeCompare(b.username)
  return {
    members: memberIds.flatMap((id) => record(scope.id, id, false) ?? []).sort(byName),
    applications: (mockApplications[scope.id] ?? []).flatMap((item) => record(scope.id, item.userId, true) ?? []).sort(byName),
  }
})

export async function getMemberRecord(scope: Scope, userId: string): Promise<MemberRecord | null> {
  const roster = await listRoster(scope)
  return roster.members.find((item) => item.userId === userId) ?? roster.applications.find((item) => item.userId === userId) ?? null
}
