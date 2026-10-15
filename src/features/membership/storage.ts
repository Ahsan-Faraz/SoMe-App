'use client'

import { useEffect, useMemo, useState } from 'react'
import { scopeKey, type MemberRecord, type Roster, type RosterEdit, type Scope } from './types'

// Device-only until the memberships/applications tables exist. One event keeps every open view
// (list, profile panel, approve button, statistics) in step.
const EVENT = 'some-roster'

export function rosterKey(community: string, scope: Pick<Scope, 'kind' | 'id'>) {
  return `some:roster:${community}:${scopeKey(scope)}`
}

export function applicationKey(community: string, scope: Pick<Scope, 'kind' | 'id'>) {
  return `some:application:${community}:${scopeKey(scope)}`
}

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new Event(EVENT))
}

export function readEdits(key: string): Record<string, RosterEdit> {
  return read<Record<string, RosterEdit>>(key, {})
}

export function editMember(key: string, userId: string, patch: RosterEdit) {
  const edits = readEdits(key)
  write(key, { ...edits, [userId]: { ...edits[userId], ...patch } })
}

// The viewer's own application (A24/A25), shown in the admin's list on this device.
export function readApplication(key: string): MemberRecord | null {
  return read<MemberRecord | null>(key, null)
}

export function saveApplication(key: string, application: MemberRecord) {
  write(key, application)
}

function applyEdit(item: MemberRecord, edit: RosterEdit | undefined): MemberRecord {
  if (!edit) return item
  return { ...item, realNames: edit.realNames ?? item.realNames, state: edit.state ?? item.state, notes: edit.notes ?? item.notes, applied: item.applied && !edit.approved }
}

export function mergeRoster(seed: Roster, edits: Record<string, RosterEdit>, mine: MemberRecord | null): Roster {
  const all = [...seed.members, ...seed.applications, ...(mine && !seed.members.some((item) => item.userId === mine.userId) ? [mine] : [])]
    .filter((item) => !edits[item.userId]?.removed)
    .map((item) => applyEdit(item, edits[item.userId]))
    .sort((a, b) => a.username.localeCompare(b.username))
  return { members: all.filter((item) => !item.applied), applications: all.filter((item) => item.applied) }
}

// A group's roster: the server seed on first paint, then this device's edits (until backend step 7).
// The community's is the database's: the seed itself, fresh after every saved change.
export function useRoster(community: string, scope: Pick<Scope, 'kind' | 'id'>, seed: Roster): Roster {
  const [roster, setRoster] = useState(seed)
  const key = rosterKey(community, scope)
  const mineKey = applicationKey(community, scope)
  const local = scope.kind !== 'community'

  useEffect(() => {
    if (!local) return
    const refresh = () => setRoster(mergeRoster(seed, readEdits(key), readApplication(mineKey)))
    refresh()
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [local, seed, key, mineKey])

  return local ? roster : seed
}

// Whole numbers only, as the profile-state fields are summed in the statistics.
export function wholeNumber(value: string) {
  return value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '')
}

// One person's record in a scope (A21/A22), with this device's edits. Null once removed.
export function useMember(community: string, scope: Pick<Scope, 'kind' | 'id'>, seed: MemberRecord): MemberRecord | null {
  const single = useMemo<Roster>(() => (seed.applied ? { members: [], applications: [seed] } : { members: [seed], applications: [] }), [seed])
  const roster = useRoster(community, scope, single)
  return [...roster.members, ...roster.applications].find((item) => item.userId === seed.userId) ?? null
}
