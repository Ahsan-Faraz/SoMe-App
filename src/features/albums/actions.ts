'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCommunity } from '@/features/communities/queries'
import { isBool, isRecord, isUuid } from '@/lib/guards'
import { t } from '@/lib/i18n'
import { NAME_MAX } from '@/lib/limits'
import { deletePrivateFiles } from '@/lib/supabase/private-files'
import { createClient } from '@/lib/supabase/server'

// Album writes. Each is one RPC that checks the caller (supabase/migrations/20261029120000_albums.sql):
// the owner changes their albums; anyone the album is shown to may try its password. refresh() sends
// the updated page back with the answer (one round trip). The guards here only turn bad input into a
// friendly message first.

export type AlbumResult = { error: string } | undefined

// Passwords come inside a FormData ({password}), never as a plain argument, so the server's own
// logging of Server Action arguments (next dev) never shows one.
const passwordOf = (form: FormData) => {
  const value = form instanceof FormData ? form.get('password') : null
  return typeof value === 'string' ? value : null
}

const errorText = (code: string) => (code === '42501' ? t.albums.notAllowed : code === '22023' ? t.albums.invalid : t.common.error)

async function communityId(slug: string): Promise<string | null> {
  return (await getCommunity(slug))?.id ?? null
}

// B3 "+": a new album.
export async function createAlbumAction(slug: string, name: string): Promise<AlbumResult> {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > NAME_MAX) return { error: t.albums.invalid }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_album', { p_community: community, p_name: name.trim() })
  if (error) return { error: errorText(error.code) }
  refresh()
}

// "Delete album": the album, its photos, then their files (after the response). Back to the list
// when it is deleted from the album itself.
export async function deleteAlbumAction(slug: string, albumId: string, listHref: string | null): Promise<AlbumResult> {
  if (!isUuid(albumId)) return { error: t.common.error }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_album', { p_community: community, p_album: albumId })
  if (error) return { error: errorText(error.code) }
  deletePrivateFiles(data)
  if (listHref?.startsWith(`/${slug}/`)) redirect(listHref)
  refresh()
}

// An uploaded photo (both files already in your folder of the private bucket) added to your album.
// add_album_photo checks the paths (your folder, both files uploaded); here only the shape.
export async function addAlbumPhotoAction(slug: string, albumId: string, photo: unknown): Promise<AlbumResult> {
  if (!isUuid(albumId) || !isRecord(photo)) return { error: t.common.error }
  const { path, thumb_path, width, height, taken_in_app } = photo
  if (typeof path !== 'string' || typeof thumb_path !== 'string' || !Number.isInteger(width) || !Number.isInteger(height) || !isBool(taken_in_app)) {
    return { error: t.common.error }
  }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('add_album_photo', {
    p_community: community,
    p_album: albumId,
    p_photo: { path, thumb_path, width: width as number, height: height as number, taken_in_app },
  })
  if (error) return { error: errorText(error.code) }
  refresh()
}

// 🗑 on a photo: the row, then its files (after the response).
export async function removeAlbumPhotoAction(slug: string, photoId: string): Promise<AlbumResult> {
  if (!isUuid(photoId)) return { error: t.common.error }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('remove_album_photo', { p_community: community, p_photo: photoId })
  if (error) return { error: errorText(error.code) }
  deletePrivateFiles(data)
  refresh()
}

// Set (4–72 characters) or remove ('') the password. Stored as a bcrypt hash; never sent back.
export async function setAlbumPasswordAction(slug: string, albumId: string, form: FormData): Promise<AlbumResult> {
  const password = passwordOf(form)
  if (!isUuid(albumId) || password === null || (password !== '' && (password.length < 4 || password.length > 72))) return { error: t.albums.passwordLength }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_album_password', { p_community: community, p_album: albumId, p_password: password })
  if (error) return { error: error.code === '22023' ? t.albums.passwordLength : errorText(error.code) }
  refresh()
}

// The password form on a locked album. Checked in the database; right = open for an hour.
export async function openAlbumAction(slug: string, albumId: string, form: FormData): Promise<AlbumResult> {
  const password = passwordOf(form)
  if (!isUuid(albumId) || password === null || password.length === 0 || password.length > 72) return { error: t.albums.wrong }
  const community = await communityId(slug)
  if (!community) return { error: t.common.error }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('open_album', { p_community: community, p_album: albumId, p_password: password })
  if (error) return { error: errorText(error.code) }
  if (data === 'wait') return { error: t.albums.wait }
  if (data !== 'open') return { error: t.albums.wrong }
  refresh()
}
