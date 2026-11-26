import { resizeImage } from '@/lib/image'
import { IMAGE_FULL_PX, MAX_IMAGE_BYTES } from '@/lib/limits'
import { createClient } from '@/lib/supabase/browser'

// Client-only. The start page image: resized on the device (about 1600 px, WebP, no EXIF) and uploaded
// straight to the public `profile` bucket at {community}/start/{uuid}.webp (only that community's
// admin may, community_start_upload). The path is never reused, so it is cached for a year.
// saveCommunityStartAction then sets it; until then nothing shows it.
export async function uploadStartImage(communityId: string, file: Blob): Promise<string> {
  const image = await resizeImage(file, IMAGE_FULL_PX)
  if (image.blob.size > MAX_IMAGE_BYTES) throw new Error('too big')
  const path = `${communityId}/start/${crypto.randomUUID()}.${image.blob.type === 'image/webp' ? 'webp' : 'jpg'}`
  const { error } = await createClient()
    .storage.from('profile')
    .upload(path, image.blob, { cacheControl: '31536000', contentType: image.blob.type, upsert: false })
  if (error) throw error
  return path
}
