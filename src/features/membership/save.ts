'use client'

import { approveApplicationAction, removeMemberAction, saveRecordAction } from './actions'
import { editMember, rosterKey } from './storage'
import type { MemberRecord, RosterEdit, Scope } from './types'

// One place where an admin's change to a member is saved: the community's in the database (the
// action refreshes the screen), a group's on this device until backend step 7.
// Returns an error to show, or null.
export async function saveMember(community: string, scope: Pick<Scope, 'kind' | 'id'>, record: Pick<MemberRecord, 'userId' | 'applicationId'>, edit: RosterEdit): Promise<string | null> {
  if (scope.kind !== 'community') {
    editMember(rosterKey(community, scope), record.userId, edit)
    return null
  }
  if (edit.approved) return record.applicationId ? ((await approveApplicationAction(community, record.applicationId))?.error ?? null) : null
  if (edit.removed) return (await removeMemberAction(community, record.userId))?.error ?? null
  const { realNames, state, notes } = edit
  return (await saveRecordAction(community, record.userId, { realNames, state, notes }))?.error ?? null
}
