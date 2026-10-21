'use client'

import { setGroupMemberAction } from '@/features/groups/actions'
import { approveApplicationAction, removeMemberAction, saveRecordAction } from './actions'
import type { MemberRecord, RosterEdit, Scope } from './types'

// One place where an admin's change to a member is saved, for the community (A20/A21/A31) or a group
// (A22/A23/A30). Each action refreshes the screen. Returns an error to show, or null.
export async function saveMember(community: string, scope: Pick<Scope, 'kind' | 'id'>, record: Pick<MemberRecord, 'userId' | 'applicationId'>, edit: RosterEdit): Promise<string | null> {
  if (edit.approved) return record.applicationId ? ((await approveApplicationAction(community, record.applicationId))?.error ?? null) : null
  if (edit.removed) {
    const result = scope.kind === 'community' ? await removeMemberAction(community, record.userId) : await setGroupMemberAction(community, scope.id, record.userId, false)
    return result?.error ?? null
  }
  const { realNames, state, notes } = edit
  return (await saveRecordAction(community, scope.kind === 'group' ? scope.id : null, record.userId, { realNames, state, notes }))?.error ?? null
}
