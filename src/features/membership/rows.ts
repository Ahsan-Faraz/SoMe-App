import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { MemberRecord, RosterMode, Scope, ScopeStats } from './types'

// The list screen (A20/A23 applications, A30/A31 members) one page at a time, used by the server for
// the first page and by the phone for the next pages and for searches, so rows are built the same
// way on both sides (roster_members / roster_applications, supabase/migrations/20261026120000_rosters.sql).

export const ROSTER_PAGE = 50

// Status names by id, from the cached builder.
export type StatusLabels = Record<string, string>

type Client = SupabaseClient<Database>
type Values = { real_name_1: string | null; real_name_2: string | null; state_1: number | null; state_2: number | null; state_3: number | null; notes: string | null }

const recordValues = (row: Values, labels: StatusLabels, statusId: string | null) => ({
  status: (statusId && labels[statusId]) || '',
  realNames: [row.real_name_1 ?? '', row.real_name_2 ?? ''],
  state: [row.state_1, row.state_2, row.state_3].map((value) => (value === null ? '' : String(value))),
  notes: row.notes ?? '',
  image: null, // only on the A21/A22 view, where it is signed
  idImage: null,
  checked: null,
})

// One page: members by name (after = the last row), applications oldest first. query: name or real
// names, searched in the database. The scope's admin is checked there too.
export async function fetchRosterPage(
  client: Client,
  communityId: string,
  scope: Pick<Scope, 'kind' | 'id'>,
  mode: RosterMode,
  query: string,
  after: MemberRecord | undefined,
  labels: StatusLabels,
): Promise<MemberRecord[]> {
  const chat = scope.kind === 'group' ? scope.id : undefined
  const text = query.trim() || undefined
  if (mode === 'members') {
    const { data, error } = await client.rpc('roster_members', { p_community: communityId, p_chat: chat, p_query: text, p_after: after?.username, p_limit: ROSTER_PAGE })
    if (error) throw error
    return data.map((row) => ({
      userId: row.user_id,
      username: row.username,
      ...recordValues(row, labels, row.status_id),
      message: '',
      applied: false,
      applicationId: null,
      appliedAt: null,
    }))
  }
  const { data, error } = await client.rpc('roster_applications', {
    p_community: communityId,
    p_chat: chat,
    p_query: text,
    p_after_at: after?.appliedAt ?? undefined,
    p_after_id: after?.applicationId ?? undefined,
    p_limit: ROSTER_PAGE,
  })
  if (error) throw error
  return data.map((row) => ({
    userId: row.user_id,
    username: row.username,
    ...recordValues(row, labels, row.status_id),
    message: row.message ?? '',
    applied: true,
    applicationId: row.application_id,
    appliedAt: row.applied_at,
  }))
}

// What scope_stats() returns.
type StatsRow = { members: number; by_status: { status_id: string | null; count: number }[]; sums: number[] }

export function toScopeStats(row: StatsRow, labels: StatusLabels, noStatus: string): ScopeStats {
  return {
    members: row.members,
    byStatus: row.by_status.map((item) => [(item.status_id && labels[item.status_id]) || noStatus, item.count]),
    sums: row.sums,
  }
}
