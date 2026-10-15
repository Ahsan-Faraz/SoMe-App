import { resizeImage, type ResizedImage } from '@/lib/image'
import { IMAGE_FULL_PX, IMAGE_THUMB_PX, MAX_IMAGE_BYTES } from '@/lib/limits'
import { createClient } from '@/lib/supabase/browser'
import type { UploadedPhoto } from './photo'

// Client-only. Resizes on the phone (about 1600 px + a 256 px thumbnail) and uploads both files
// straight to your folder in a bucket: {community}/{you}/{uuid}.webp and _t.webp. The public
// `profile` bucket for profile photos; the `private` one (signed URLs only) for application images.
// The photo row is made afterwards by the action that uses it, which checks both files are there.
// `source` is a camera capture already resized by CameraCapture, or a picked file.
export async function uploadPhoto(
  bucket: 'profile' | 'private',
  communityId: string,
  userId: string,
  source: Blob | ResizedImage,
  takenInApp: boolean,
): Promise<UploadedPhoto> {
  const full = source instanceof Blob ? await resizeImage(source, IMAGE_FULL_PX) : source
  if (full.blob.size > MAX_IMAGE_BYTES) throw new Error('too big')
  const thumb = await resizeImage(full.blob, IMAGE_THUMB_PX)

  const name = `${communityId}/${userId}/${crypto.randomUUID()}`
  const ext = full.blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${name}.${ext}`
  const thumbPath = `${name}_t.${ext}`
  // Paths are never reused, so the files can be cached for a year.
  const storage = createClient().storage.from(bucket)
  const [main, small] = await Promise.all([
    storage.upload(path, full.blob, { cacheControl: '31536000', contentType: full.blob.type, upsert: false }),
    storage.upload(thumbPath, thumb.blob, { cacheControl: '31536000', contentType: thumb.blob.type, upsert: false }),
  ])
  if (main.error) throw main.error
  if (small.error) throw small.error
  return { path, thumbPath, width: full.width, height: full.height, takenInApp }
}
