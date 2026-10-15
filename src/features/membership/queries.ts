import 'server-only'
import { cache } from 'react'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { getGroup } from '@/features/groups/queries'
import { formatDay } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { mockApplicants, mockApplications, mockGroupMembers, mockMemberState, mockProfiles, mockRealNames } from '@/mocks/data'
import { REAL_NAMES, STATE_FIELDS, type ApplicationImage, type MemberRecord, type Roster, type Scope, type ScopeKind } from './types'

// Signed URLs for application images (private bucket) last this long; a page is read well within it.
const SIGNED_URL_SECONDS = 60 * 60

// cache(): a page and its header both ask for the scope in one request.
export const getScope = cache(async (kind: ScopeKind, community: string, groupId = ''): Promise<Scope | null> => {
  if (kind === 'community') {
    const found = await getCommunity(community)
    return found
      ? { kind, id: 'community', name: found.name, stateLabels: found.stateLabels, applicationText: found.applicationText, requires: found.requires }
      : null
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

// A20/A23 applications and A30/A31 members, with the scope's admin records. The community's come
// from the database in one call per list (admin_roster); a group's are mock data until step 7.
export const listRoster = cache(async (community: string, scope: Scope): Promise<Roster> => {
  if (scope.kind === 'group') return mockRoster(scope)

  const info = await getCommunity(community)
  if (!info) return { members: [], applications: [] }
  const supabase = await createClient()
  const [members, applications, schema] = await Promise.all([
    supabase.rpc('admin_roster', { p_community: info.id, p_applications: false }),
    supabase.rpc('admin_roster', { p_community: info.id, p_applications: true }),
    getProfileSchema(info.id),
  ])
  if (members.error) throw members.error
  if (applications.error) throw applications.error

  const statusName = new Map(schema.statuses.map((status) => [status.id, status.label]))
  const toRecord = (row: (typeof members.data)[number], applied: boolean): MemberRecord => ({
    userId: row.user_id,
    username: row.username,
    status: (row.status_id && statusName.get(row.status_id)) ?? '',
    realNames: [row.real_name_1 ?? '', row.real_name_2 ?? ''],
    state: [row.state_1, row.state_2, row.state_3].map((value) => (value === null ? '' : String(value))),
    notes: row.notes ?? '',
    image: null, // only on the A21 view, where it is signed
    message: row.message ?? '',
    applied,
    applicationId: row.application_id,
  })
  return { members: members.data.map((row) => toRecord(row, false)), applications: applications.data.map((row) => toRecord(row, true)) }
})

// What admin_member() returns (supabase/migrations/20261016120000_applications.sql).
type AdminMemberRow = {
  user_id: string
  state: string
  application: {
    id: string
    status: string
    message: string | null
    real_name_1: string | null
    real_name_2: string | null
    photo: { path: string; taken_in_app: boolean; taken_at: string | null; created_at: string } | null
  } | null
  record: { real_name_1: string | null; real_name_2: string | null; state_1: number | null; state_2: number | null; state_3: number | null; notes: string | null } | null
}

// A21/A22: one person's application and admin record in this scope, or null (not in the community).
// The application image is in the private bucket: signed here, for this admin, after the database
// has confirmed (admin_member checks the role) that they may see the application.
export async function getMemberRecord(community: string, scope: Scope, userId: string): Promise<MemberRecord | null> {
  if (scope.kind === 'group') {
    const roster = mockRoster(scope)
    return roster.members.find((item) => item.userId === userId) ?? roster.applications.find((item) => item.userId === userId) ?? null
  }

  const info = await getCommunity(community)
  if (!info) return null
  const supabase = await createClient()
  const [{ data, error }, schema, profile] = await Promise.all([
    supabase.rpc('admin_member', { p_community: info.id, p_user: userId }),
    getProfileSchema(info.id),
    supabase.from('members').select('username, status_id').eq('community_id', info.id).eq('user_id', userId).maybeSingle(),
  ])
  if (error) throw error
  if (profile.error) throw profile.error
  if (!data || !profile.data) return null
  const row = data as unknown as AdminMemberRow
  const application = row.application
  const record = row.record

  let image: ApplicationImage | null = null
  if (application?.photo) {
    const signed = await createAdminClient().storage.from('private').createSignedUrl(application.photo.path, SIGNED_URL_SECONDS)
    if (signed.data) {
      image = {
        src: signed.data.signedUrl,
        verified: application.photo.taken_in_app,
        date: formatDay(new Date(application.photo.taken_at ?? application.photo.created_at)),
      }
    }
  }

  return {
    userId,
    username: profile.data.username,
    status: schema.statuses.find((status) => status.id === profile.data?.status_id)?.label ?? '',
    realNames: [record?.real_name_1 ?? application?.real_name_1 ?? '', record?.real_name_2 ?? application?.real_name_2 ?? ''],
    state: [record?.state_1 ?? null, record?.state_2 ?? null, record?.state_3 ?? null].map((value) => (value === null ? '' : String(value))),
    notes: record?.notes ?? '',
    image,
    message: application?.message ?? '',
    applied: row.state === 'applied' && (application?.status === 'pending' || application?.status === 'later'),
    applicationId: application && (application.status === 'pending' || application.status === 'later') ? application.id : null,
  }
}

// Groups: mock data until backend step 7.
const everyone = [...mockProfiles, ...mockApplicants]

function mockRecord(scopeId: string, userId: string, applied: boolean): MemberRecord | null {
  const profile = everyone.find((item) => item.id === userId)
  if (!profile) return null
  const saved = mockMemberState[scopeId]?.[userId]
  const application = mockApplications[scopeId]?.find((item) => item.userId === userId)
  return {
    userId,
    username: profile.username,
    status: profile.status,
    realNames: Array.from({ length: REAL_NAMES }, (_, i) => mockRealNames[userId]?.[i] ?? ''),
    state: saved?.state ?? Array.from({ length: STATE_FIELDS }, () => ''),
    notes: saved?.notes ?? '',
    image: application?.image ?? null,
    message: application?.message ?? '',
    applied,
    applicationId: null,
  }
}

// Sorted by profile name (the only sort order for now).
function mockRoster(scope: Scope): Roster {
  const byName = (a: MemberRecord, b: MemberRecord) => a.username.localeCompare(b.username)
  return {
    members: (mockGroupMembers[scope.id] ?? []).flatMap((id) => mockRecord(scope.id, id, false) ?? []).sort(byName),
    applications: (mockApplications[scope.id] ?? []).flatMap((item) => mockRecord(scope.id, item.userId, true) ?? []).sort(byName),
  }
}
