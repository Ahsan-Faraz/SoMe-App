import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './types'

// Chat images live in the private bucket: links are signed per person, and only for members who can
// see the post (storage policy private_chat_photos_read). A page signs all its thumbnails in one call;
// the full image is signed when it is opened. Links last an hour; a page is read well within it.
export const SIGNED_URL_SECONDS = 60 * 60

// Any Supabase client: the server's (first page) or the browser's (live messages, older pages).
type Signer = { storage: SupabaseClient['storage'] }

// path → signed URL, for every path the caller may read (the rest are left out).
export async function signPaths(client: Signer, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return new Map()
  const { data } = await client.storage.from('private').createSignedUrls(unique, SIGNED_URL_SECONDS)
  return new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])))
}

// These messages with their thumbnails signed (one call for all of them).
export async function withThumbnails(client: Signer, messages: ChatMessage[]): Promise<ChatMessage[]> {
  const wanted = messages.flatMap((message) => (message.photo && !message.imageSrc ? [message.photo.thumbPath] : []))
  if (wanted.length === 0) return messages
  const urls = await signPaths(client, wanted)
  return messages.map((message) => (message.photo && !message.imageSrc ? { ...message, imageSrc: urls.get(message.photo.thumbPath) ?? null } : message))
}
