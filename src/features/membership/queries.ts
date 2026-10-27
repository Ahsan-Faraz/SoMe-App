import 'server-only'
import { cache } from 'react'
import { getCommunity } from '@/features/communities/queries'
import { getProfileSchema } from '@/features/fields/queries'
import { getGroupSettings } from '@/features/groups/queries'
import { formatDay } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { t } from '@/lib/i18n'
import { fetchRosterPage, toScopeStats, type StatusLabels } from './rows'
import type { ApplicationImage, MemberRecord, RosterMode, Scope, ScopeKind, ScopeStats, SentApplication } from './types'

// Signed URLs for application images (private bucket) last this long; a page is read well within it.
const SIGNED_URL_SECONDS = 60 * 60

// The community, or a group the viewer runs (group admin or community admin; null otherwise).
// cache(): a page and its header both ask for the scope in one request.
export const getScope = cache(async (kind: ScopeKind, community: string, groupId = ''): Promise<Scope | null> => {
  if (kind === 'community') {
    const found = await getCommunity(community)
    return found
      ? { kind, id: 'community', name: found.name, stateLabels: found.stateLabels, applicationText: found.applicationText, requires: found.requires }
      : null
  }
  const settings = await getGroupSettings(community, groupId)
  if (!settings) return null
  const { group } = settings
  return {
    kind,
    id: group.id,
    name: group.name,
    stateLabels: group.stateLabels,
    applicationText: group.applicationText,
    requires: { image: group.applyImage, text: group.applyText, names: group.applyNames, identity: false },
  }
})

// A20/A23 applications or A30/A31 members of the community or a group: the first page (the phone
// loads the next ones and searches, features/membership/rows.ts). The database checks the admin.
export type RosterStart = { communityId: string; rows: MemberRecord[]; labels: StatusLabels }

export async function listRosterPage(community: string, scope: Pick<Scope, 'kind' | 'id'>, mode: RosterMode): Promise<RosterStart | null> {
  const info = await getCommunity(community)
  if (!info) return null
  const [supabase, schema] = await Promise.all([createClient(), getProfileSchema(info.id)])
  const labels = statusLabels(schema.statuses)
  return { communityId: info.id, rows: await fetchRosterPage(supabase, info.id, scope, mode, '', undefined, labels), labels }
}

// A28/A33: counted in the database over the whole scope. Null when the viewer doesn't run it.
export async function getScopeStats(community: string, scope: Pick<Scope, 'kind' | 'id'>): Promise<ScopeStats | null> {
  const info = await getCommunity(community)
  if (!info) return null
  const supabase = await createClient()
  const [{ data, error }, schema] = await Promise.all([
    supabase.rpc('scope_stats', { p_community: info.id, p_chat: scope.kind === 'group' ? scope.id : undefined }),
    getProfileSchema(info.id),
  ])
  if (error) throw error
  if (!data) return null
  return toScopeStats(data as unknown as Parameters<typeof toScopeStats>[0], statusLabels(schema.statuses), t.membership.noStatus)
}

const statusLabels = (statuses: readonly { id: string; label: string }[]): StatusLabels => Object.fromEntries(statuses.map((status) => [status.id, status.label]))

// What admin_member() and group_member() return (supabase/migrations/20261019120000_real_members.sql,
// 20261021120000_groups.sql). state: the community account's; member: in the group.
type AdminMemberRow = {
  user_id: string
  state?: string
  member?: boolean
  application: {
    id: string
    status: string
    message: string | null
    real_name_1: string | null
    real_name_2: string | null
    photo: PhotoRow | null
    id_photo: PhotoRow | null
    media_deleted_at: string | null
    decided_by: string | null
  } | null
  record: { real_name_1: string | null; real_name_2: string | null; state_1: number | null; state_2: number | null; state_3: number | null; notes: string | null } | null
}

// A21/A22: one person's application and admin record in this scope, or null (not in the community,
// or neither in the group nor applying to it). The application image is in the private bucket:
// signed here, for this admin, after the database has confirmed (admin_member / group_member check
// the role) that they may see the application.
export async function getMemberRecord(community: string, scope: Scope, userId: string): Promise<MemberRecord | null> {
  const info = await getCommunity(community)
  if (!info) return null
  const supabase = await createClient()
  const [{ data, error }, schema, profile] = await Promise.all([
    scope.kind === 'group'
      ? supabase.rpc('group_member', { p_community: info.id, p_chat: scope.id, p_user: userId })
      : supabase.rpc('admin_member', { p_community: info.id, p_user: userId }),
    getProfileSchema(info.id),
    supabase.from('members').select('username, status_id').eq('community_id', info.id).eq('user_id', userId).maybeSingle(),
  ])
  if (error) throw error
  if (profile.error) throw profile.error
  if (!data || !profile.data) return null
  const row = data as unknown as AdminMemberRow
  const application = row.application
  const record = row.record

  const [image, idImage] = await signImages(createAdminClient(), [application?.photo ?? null, application?.id_photo ?? null])

  return {
    userId,
    username: profile.data.username,
    status: schema.statuses.find((status) => status.id === profile.data?.status_id)?.label ?? '',
    realNames: [record?.real_name_1 ?? application?.real_name_1 ?? '', record?.real_name_2 ?? application?.real_name_2 ?? ''],
    state: [record?.state_1 ?? null, record?.state_2 ?? null, record?.state_3 ?? null].map((value) => (value === null ? '' : String(value))),
    notes: record?.notes ?? '',
    image,
    idImage,
    checked: application?.media_deleted_at ? { date: formatDay(new Date(application.media_deleted_at)), by: application.decided_by ?? '' } : null,
    message: application?.message ?? '',
    applied: (scope.kind === 'group' ? row.member === false : row.state === 'applied') && (application?.status === 'pending' || application?.status === 'later'),
    applicationId: application && (application.status === 'pending' || application.status === 'later') ? application.id : null,
    appliedAt: null,
  }
}

// What my_application() returns (supabase/migrations/20261017120000_feedback_261016.sql).
type MyApplicationRow = {
  message: string | null
  real_name_1: string | null
  real_name_2: string | null
  photo: PhotoRow | null
  id_photo: PhotoRow | null
}

// A25: your own community application, to show what you sent. Null before applying. The image is
// in your own folder of the private bucket, so your own session signs it (the storage policy allows
// only your own files).
export async function getMyApplication(community: string): Promise<SentApplication | null> {
  const info = await getCommunity(community)
  if (!info) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_application', { p_community: info.id })
  if (error) throw error
  if (!data) return null
  const row = data as unknown as MyApplicationRow

  const [image, idImage] = await signImages(supabase, [row.photo, row.id_photo])
  return { image, idImage, message: row.message ?? '', realNames: [row.real_name_1 ?? '', row.real_name_2 ?? ''] }
}

// An application's images (private bucket) as screens show them, signed in one call. Who may see
// them is checked by the RPC that returned the rows; the client signing them must be allowed to
// read the files (the admin client for the admin's view, your own session for your own files).
type PhotoRow = { path: string; taken_in_app: boolean; taken_at: string | null; created_at: string }
type StorageClient = { storage: Awaited<ReturnType<typeof createClient>>['storage'] }

async function signImages(client: StorageClient, [image, idImage]: [PhotoRow | null, PhotoRow | null]): Promise<[ApplicationImage | null, ApplicationImage | null]> {
  const paths = [image, idImage].flatMap((photo) => (photo ? [photo.path] : []))
  if (paths.length === 0) return [null, null]
  const { data } = await client.storage.from('private').createSignedUrls(paths, SIGNED_URL_SECONDS)
  const urls = new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])))
  const shown = (photo: PhotoRow | null): ApplicationImage | null => {
    const src = photo ? urls.get(photo.path) : undefined
    return photo && src ? { src, verified: photo.taken_in_app, date: formatDay(new Date(photo.taken_at ?? photo.created_at)) } : null
  }
  return [shown(image), shown(idImage)]
}
