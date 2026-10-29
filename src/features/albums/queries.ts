import 'server-only'
import { getCommunity } from '@/features/communities/queries'
import { formatDay } from '@/lib/format'
import { isRecord, isUuid } from '@/lib/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { AlbumAccess, AlbumCard, AlbumDetail, AlbumPhoto } from './types'

// Album links last an hour: as long as an album opened with its password stays open (album_grants).
const SIGNED_URL_SECONDS = 60 * 60

// Signs album files in one call with the service role. Only ever with paths an album RPC has just
// returned for the caller (it checked the album is open to them); no Storage policy lets other
// members read album files, so a policy doesn't check every file again.
async function signAlbumPaths(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return new Map()
  const { data, error } = await createAdminClient().storage.from('private').createSignedUrls(unique, SIGNED_URL_SECONDS)
  if (error) throw error
  return new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])))
}

// B3: a member's albums (album_list: themselves, or both approved with no block). Covers signed.
export async function listAlbums(slug: string, ownerId: string): Promise<AlbumCard[]> {
  const community = await getCommunity(slug)
  if (!community || !isUuid(ownerId)) return []
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('album_list', { p_community: community.id, p_owner: ownerId })
  if (error) throw error
  const covers = await signAlbumPaths(data.flatMap((row) => (row.cover ? [row.cover] : [])))
  return data.map((row) => ({ id: row.id, name: row.name, locked: row.locked, photos: row.photos, cover: row.cover ? (covers.get(row.cover) ?? null) : null }))
}

const ACCESS: readonly AlbumAccess[] = ['owner', 'open', 'locked']
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const size = (value: unknown) => (typeof value === 'number' ? value : null)

// B4: one album, its photos signed when it is open to the viewer. Null: no such album to see.
export async function getAlbum(slug: string, albumId: string): Promise<AlbumDetail | null> {
  const community = await getCommunity(slug)
  if (!community || !isUuid(albumId)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('album_view', { p_community: community.id, p_album: albumId })
  if (error) throw error
  if (!isRecord(data)) return null

  const access = ACCESS.find((item) => item === data.access)
  if (!access) return null
  const rows = (Array.isArray(data.photos) ? data.photos : []).flatMap((row) => (isRecord(row) ? [row] : []))
  const urls = await signAlbumPaths(rows.map((row) => text(row.path)))
  const photos: AlbumPhoto[] = rows.flatMap((row) => {
    const src = urls.get(text(row.path))
    if (!src) return []
    const verified = row.taken_in_app === true
    return [{ id: text(row.id), src, width: size(row.width), height: size(row.height), verified, date: verified && row.taken_at ? formatDay(new Date(text(row.taken_at))) : '' }]
  })
  return { id: text(data.id), ownerId: text(data.owner_id), name: text(data.name), locked: data.locked === true, access, photos }
}
