import { getSupabaseEnv } from '@/lib/env'
import { formatDay } from '@/lib/format'
import type { ProfilePhoto } from './types'

// Profile photos live in the public `profile` bucket under unguessable, never-reused paths, so the
// URL can be cached for a year and needs no signing.
export function profilePhotoUrl(path: string): string {
  return `${getSupabaseEnv().url}/storage/v1/object/public/profile/${path}`
}

// A photo as profile() returns it.
export type PhotoRow = {
  id: string
  path: string
  thumb_path: string
  width: number | null
  height: number | null
  taken_in_app: boolean
  taken_at: string | null
  created_at: string
}

export function toProfilePhoto(row: PhotoRow): ProfilePhoto {
  return {
    id: row.id,
    src: profilePhotoUrl(row.path),
    thumb: profilePhotoUrl(row.thumb_path),
    width: row.width,
    height: row.height,
    verified: row.taken_in_app,
    date: formatDay(new Date(row.taken_at ?? row.created_at)),
  }
}

// Set on your own profile only: what the photo pickers need to upload and save.
export type Owner = { slug: string; communityId: string; userId: string }

// Where an uploaded photo goes on your profile (add_profile_photo's p_slot): the profile image (the
// icon and the search card photo), or a photo field's answer for one person (no substatus = main section).
export type PhotoSlot = { kind: 'profile' } | { kind: 'field'; fieldId: string; substatusId: string | null; n: number }

// Both files already in Storage, as the upload left them.
export type UploadedPhoto = { path: string; thumbPath: string; width: number; height: number; takenInApp: boolean }
