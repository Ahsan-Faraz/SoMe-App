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

// These messages with their thumbnails signed, and those of the posts they comment on (one call for all of them).
export async function withThumbnails(client: Signer, messages: ChatMessage[]): Promise<ChatMessage[]> {
  const own = (message: ChatMessage) => (message.photo && !message.imageSrc ? message.photo.thumbPath : null)
  const quoted = (message: ChatMessage) => (message.replyTo?.photo && !message.replyTo.photo.src ? message.replyTo.photo.thumbPath : null)
  const wanted = messages.flatMap((message) => [own(message), quoted(message)].filter((path) => path !== null))
  if (wanted.length === 0) return messages
  const urls = await signPaths(client, wanted)
  return messages.map((message) => {
    const mine = own(message)
    const theirs = quoted(message)
    if (!mine && !theirs) return message
    return {
      ...message,
      imageSrc: mine ? (urls.get(mine) ?? null) : message.imageSrc,
      // A commented post the viewer can't see (history off) gets no link: the quote stays text only.
      replyTo: message.replyTo && theirs ? { ...message.replyTo, photo: { thumbPath: theirs, src: urls.get(theirs) ?? null } } : message.replyTo,
    }
  })
}
