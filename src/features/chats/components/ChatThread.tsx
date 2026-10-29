'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { scrollArea } from '@/components/ui/Screen'
import type { PickedPhoto } from '@/features/albums/types'
import type { UploadedPhoto } from '@/features/profiles/photo'
import { formatPostTime } from '@/lib/format'
import { t } from '@/lib/i18n'
import { MESSAGE_MAX } from '@/lib/limits'
import { createClient } from '@/lib/supabase/browser'
import { deleteMessageAction } from '../actions'
import { signPaths, withThumbnails } from '../images'
import { CATCH_UP_LIMIT, isMessageRow, MESSAGE_PAGE, mergeMessages, newestSeq, pickReaction, toMessage, toReactions, type MessageRow } from '../messages'
import type { ChatMessage, ChatRules } from '../types'
import type { ReactionDetail } from './PostSheet'

const PostSheet = dynamic(() => import('./PostSheet').then((mod) => mod.PostSheet), { ssr: false })
const PictureSheet = dynamic(() => import('./PictureSheet').then((mod) => mod.PictureSheet), { ssr: false })
const ImageViewer = dynamic(() => import('./ImageViewer').then((mod) => mod.ImageViewer), { ssr: false })

const LONG_PRESS_MS = 450
// Older messages start loading this close to the top, so scrolling up rarely waits.
const OLDER_AT_PX = 600
// New messages keep the view at the bottom only when you are already there (else you are reading back).
const NEAR_BOTTOM_PX = 150
// A picture in the chat is at most this tall; it keeps its own shape (no cropping).
const IMAGE_MAX_HEIGHT_PX = 320

// After the next render: stick to the bottom, keep this distance from the bottom (an older page was
// added above), or leave the scroll where it is.
type Anchor = 'bottom' | number | null

// A picture you are sending: the image to upload, and the upload once done (a retry reuses it).
type Outgoing = { blob: Blob; verified: boolean; uploaded: UploadedPhoto | null }

// A4. Messages on screen: the newest page from the server, older pages added on scroll up, and live
// changes from the chat's private Realtime channel (new posts, reactions, edits, deletions). Sending
// shows the post at once and saves it straight to the database (send_message), with a comment's
// post and a picture when there is one; the database numbers it and broadcasts it. Reactions and
// edits are saved the same way and shown at once; deleting goes through the server (it also deletes
// the pictures' files). Pictures are private: thumbnails are signed for the viewer, the full image
// when tapped. Opening and leaving the chat mark it read; a reconnect or coming back to the app loads
// anything missed (one call). A new DM (chatId null) is made on the first message. A DM with a block
// is read only for both; when the other person blocks or deletes the chat while it is open, the
// channel says so at once. Keyed by chat: each chat has its own state.
export function ChatThread({
  community,
  communityId,
  chatId,
  dmUserId = null,
  group,
  initial,
  hasOlder,
  blocked: blockedOnServer = false,
  statuses,
  viewerId,
  isAdmin,
  rules,
  backHref,
}: {
  community: string
  communityId: string
  chatId: string | null // null: a DM that doesn't exist yet
  dmUserId?: string | null // the new DM's other person
  group: boolean
  initial: ChatMessage[] // oldest first
  hasOlder: boolean
  blocked?: boolean // a DM where one of the two blocked the other
  statuses: Record<string, string> // Status id → label, for live group posts
  viewerId: string
  isAdmin: boolean // runs this group: may delete any post
  rules: ChatRules
  backHref: string
}) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [older, setOlder] = useState(hasOlder)
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<ChatMessage | null>(null)
  const [replying, setReplying] = useState<ChatMessage | null>(null)
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [picture, setPicture] = useState(false)
  const [viewing, setViewing] = useState<{ src: string; verified: boolean; date: string | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Blocked while open (the other person left with "Keep chat"); the server's value covers the rest.
  const [blockedHere, setBlockedHere] = useState(false)
  const blocked = blockedOnServer || blockedHere
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const latest = useRef(items) // the messages on screen, for callbacks that outlive a render
  const anchor = useRef<Anchor>('bottom')
  const loadingOlder = useRef(false)
  const readUpTo = useRef(0)
  const outgoing = useRef(new Map<string, Outgoing>()) // clientId → a picture being sent
  const profileHref = (userId: string) => `/${community}/profiles/${userId}?back=${encodeURIComponent(backHref)}`

  useLayoutEffect(() => {
    latest.current = items
    const element = scroller.current
    const mode = anchor.current
    anchor.current = null
    if (!element || mode === null) return
    if (mode === 'bottom') {
      element.scrollTop = element.scrollHeight
      // Off-screen posts use an estimated height (content-visibility); settle once they are drawn.
      const frame = requestAnimationFrame(() => (element.scrollTop = element.scrollHeight))
      return () => cancelAnimationFrame(frame)
    }
    element.scrollTop = element.scrollHeight - mode
  }, [items])

  const nearBottom = () => {
    const element = scroller.current
    return !element || element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX
  }

  const update = (seq: number, change: (message: ChatMessage) => ChatMessage) =>
    setItems((current) => current.map((message) => (message.seq === seq ? change(message) : message)))

  // Rows from the database or the channel, with their thumbnails signed (one call), added in order.
  const toMessages = useCallback(
    (rows: MessageRow[]) => withThumbnails(createClient(), rows.map((row) => toMessage(row, viewerId, group, statuses))),
    [viewerId, group, statuses],
  )

  const receive = useCallback(
    async (rows: MessageRow[]) => {
      if (rows.length === 0) return
      const incoming = await toMessages(rows)
      if (nearBottom()) anchor.current = 'bottom'
      setItems((current) => mergeMessages(current, incoming))
    },
    [toMessages],
  )

  // Everything newer than the newest message on screen, in one call. More than a page missed: show
  // the newest page instead (older ones load on scroll up), so nothing is skipped silently.
  const catchUp = useCallback(async () => {
    if (!chatId) return
    const { data, error } = await createClient().rpc('list_messages', {
      p_community: communityId,
      p_chat: chatId,
      p_after: newestSeq(latest.current),
      p_limit: CATCH_UP_LIMIT,
    })
    if (error || !data) return
    const rows = data as unknown as MessageRow[]
    if (rows.length < CATCH_UP_LIMIT) return receive(rows)
    const page = await toMessages(rows.slice(0, MESSAGE_PAGE))
    anchor.current = 'bottom'
    setItems((current) => mergeMessages(current.filter((message) => message.seq === null), page))
    setOlder(true)
  }, [chatId, communityId, receive, toMessages])

  // Read up to the newest message on screen; only when that moved on.
  const markRead = useCallback(async () => {
    const seq = newestSeq(latest.current)
    if (!chatId || seq <= readUpTo.current) return
    readUpTo.current = seq
    await createClient().rpc('mark_read', { p_community: communityId, p_chat: chatId, p_seq: seq })
  }, [chatId, communityId])

  // Called from the channel and page events below: always the latest render's version, so the
  // channel itself only depends on the chat (a refresh never makes it leave and join again).
  const onMessage = useEffectEvent((payload: unknown) => {
    if (isMessageRow(payload)) void receive([payload])
  })
  const onReaction = useEffectEvent((payload: unknown) => {
    const { seq, reactions, user_id: userId, emoji } = (payload ?? {}) as { seq?: number; reactions?: Record<string, number>; user_id?: string; emoji?: string | null }
    if (typeof seq !== 'number' || !reactions) return
    // Whose reaction moved decides the "mine" mark: yours (another of your tabs), or keep yours.
    update(seq, (message) => {
      const mine = userId === viewerId ? (emoji ?? null) : (message.reactions.find((reaction) => reaction.mine)?.emoji ?? null)
      return { ...message, reactions: toReactions(reactions, mine) }
    })
  })
  const onEdited = useEffectEvent((payload: unknown) => {
    const { seq, body } = (payload ?? {}) as { seq?: number; body?: string | null }
    if (typeof seq === 'number') update(seq, (message) => ({ ...message, body: body ?? '', edited: true }))
  })
  const onRemoved = useEffectEvent((payload: unknown) => {
    const seqs = (payload ?? {}) as { seqs?: unknown }
    if (Array.isArray(seqs.seqs)) setItems((current) => current.filter((message) => message.seq === null || !(seqs.seqs as unknown[]).includes(message.seq)))
  })
  const onCatchUp = useEffectEvent(() => void catchUp())
  const onDeleted = useEffectEvent(() => router.replace(`/${community}/chats`))

  // The open chat: join its live channel (the database lets members only), mark it read, and catch
  // up whenever the channel (re)joins, the app comes back, or the phone is back online. Leaving
  // (another page, or the app hidden) marks it read again; on leaving, the chat list reloads after.
  useEffect(() => {
    if (!chatId) return
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let active = true
    void markRead()
    void (async () => {
      await supabase.realtime.setAuth()
      if (!active) return
      channel = supabase
        .channel(`chat:${chatId}`, { config: { private: true } })
        .on('broadcast', { event: 'message' }, ({ payload }) => onMessage(payload))
        .on('broadcast', { event: 'reaction' }, ({ payload }) => onReaction(payload))
        .on('broadcast', { event: 'edited' }, ({ payload }) => onEdited(payload))
        .on('broadcast', { event: 'removed' }, ({ payload }) => onRemoved(payload))
        .on('broadcast', { event: 'blocked' }, () => setBlockedHere(true))
        .on('broadcast', { event: 'deleted' }, () => onDeleted())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onCatchUp()
        })
    })()
    const onVisibility = () => (document.visibilityState === 'visible' ? onCatchUp() : void markRead())
    const onOnline = () => onCatchUp()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      if (channel) void supabase.removeChannel(channel)
      void markRead().then(() => router.refresh())
    }
  }, [chatId, markRead, router])

  // The page before the oldest message on screen, kept in place: the view stays where it was.
  const loadOlder = useCallback(async () => {
    const oldest = latest.current.find((message) => message.seq !== null)?.seq
    if (!chatId || !older || loadingOlder.current || !oldest) return
    loadingOlder.current = true
    const { data, error } = await createClient().rpc('list_messages', { p_community: communityId, p_chat: chatId, p_before: oldest, p_limit: MESSAGE_PAGE })
    if (error || !data) {
      loadingOlder.current = false
      return
    }
    const rows = data as unknown as MessageRow[]
    const page = await toMessages(rows)
    loadingOlder.current = false
    const element = scroller.current
    anchor.current = element ? element.scrollHeight - element.scrollTop : null
    setItems((current) => mergeMessages(current, page))
    setOlder(rows.length === MESSAGE_PAGE)
  }, [chatId, communityId, older, toMessages])

  // A first page shorter than the screen can't be scrolled: load older ones until it can.
  useEffect(() => {
    const element = scroller.current
    if (older && element && element.scrollHeight <= element.clientHeight + OLDER_AT_PX) void loadOlder()
  }, [items, older, loadOlder])

  // Save one post (again, after a failure: the same clientId, so it is saved once; a picture already
  // uploaded is not uploaded again). A new DM is made first, then the page moves to it.
  async function deliver(message: ChatMessage) {
    setItems((current) => current.map((item) => (item.id === message.id ? { ...item, state: 'sending' } : item)))
    const supabase = createClient()
    const failed = () => setItems((current) => current.map((item) => (item.id === message.id ? { ...item, state: 'failed' } : item)))

    let photo: UploadedPhoto | null = null
    const picked = message.clientId ? outgoing.current.get(message.clientId) : undefined
    if (picked) {
      try {
        if (!picked.uploaded) {
          const { uploadPhoto } = await import('@/features/profiles/upload')
          picked.uploaded = await uploadPhoto('private', communityId, viewerId, picked.blob, picked.verified)
        }
        photo = picked.uploaded
      } catch {
        return failed()
      }
    }

    let target = chatId
    if (!target && dmUserId) {
      const { data, error } = await supabase.rpc('open_dm', { p_community: communityId, p_user: dmUserId })
      target = error ? null : data
    }
    const result = target
      ? await supabase.rpc('send_message', {
          p_community: communityId,
          p_chat: target,
          p_body: message.body,
          p_client_id: message.clientId ?? undefined,
          p_reply_to: message.replyTo?.seq ?? undefined,
          p_photo: photo ? { path: photo.path, thumb_path: photo.thumbPath, width: photo.width, height: photo.height, taken_in_app: photo.takenInApp } : undefined,
        })
      : null
    const saved = result && !result.error ? savedOf(result.data) : null
    if (!target || !saved) return failed()
    if (message.clientId) outgoing.current.delete(message.clientId)
    setItems((current) => mergeMessages(current, [{ ...message, id: String(saved.seq), seq: saved.seq, createdAt: saved.createdAt, state: 'sent' }]))
    if (!chatId) router.replace(`/${community}/chats/${target}`)
  }

  // A new post on screen (sending), then saved.
  function post(body: string, image: { src: string; verified: boolean; date: string } | null, blob: Blob | null) {
    const clientId = crypto.randomUUID()
    if (blob && image) outgoing.current.set(clientId, { blob, verified: image.verified, uploaded: null })
    const message: ChatMessage = {
      id: `c:${clientId}`,
      seq: null,
      clientId,
      author: t.chats.you,
      authorId: null,
      authorStatus: null,
      mine: true,
      system: false,
      body,
      createdAt: new Date().toISOString(),
      state: 'sending',
      reactions: [],
      edited: false,
      replyTo: replying?.seq ? { seq: replying.seq, author: replying.author, body: replying.body || t.chats.picture } : null,
      image: image !== null,
      photo: null,
      imageSrc: image?.src ?? null,
      verified: image?.verified ?? false,
      verifiedDate: image?.verified ? image.date : null,
    }
    anchor.current = 'bottom'
    setItems((current) => [...current, message])
    setReplying(null)
    setNotice(null)
    void deliver(message)
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (editing) return void saveEdit(editing, body)
    if (!body) return
    if (body.length > MESSAGE_MAX) {
      setNotice(t.chats.tooLong(MESSAGE_MAX))
      return
    }
    setDraft('')
    if (input.current) input.current.style.height = 'auto'
    post(body, null, null)
  }

  async function sendPicture(shot: PickedPhoto) {
    setPicture(false)
    try {
      // A capture or upload (data URL), or an album / profile photo: copied into the chat.
      const blob = await (await fetch(shot.src)).blob()
      post('', shot, blob)
    } catch {
      setNotice(t.chats.pictureFailed)
    }
  }

  // Your one reaction, shown at once and saved; the counts then come from the database.
  function react(message: ChatMessage, emoji: string | null) {
    if (!chatId || message.seq === null) return
    const seq = message.seq
    const before = message.reactions
    update(seq, (item) => ({ ...item, reactions: pickReaction(item.reactions, emoji) }))
    void createClient()
      .rpc('set_reaction', { p_community: communityId, p_chat: chatId, p_seq: seq, p_emoji: emoji as string }) // null takes it back (the generated types can't say so)
      .then(({ data, error }) => {
        if (error) {
          update(seq, (item) => ({ ...item, reactions: before }))
          setNotice(t.chats.notAllowed)
        } else if (data && typeof data === 'object') {
          update(seq, (item) => ({ ...item, reactions: toReactions(data as Record<string, number>, emoji) }))
        }
      })
  }

  function startComment(message: ChatMessage) {
    setEditing(null)
    setReplying(message)
    input.current?.focus()
  }

  function startEdit(message: ChatMessage) {
    setReplying(null)
    setEditing(message)
    setDraft(message.body)
    input.current?.focus()
  }

  function stopEdit() {
    setEditing(null)
    setDraft('')
  }

  // The new text at once; back to the old one if the database refuses it.
  async function saveEdit(message: ChatMessage, body: string) {
    if (!chatId || message.seq === null) return
    if (!body && !message.image) return
    const seq = message.seq
    stopEdit()
    update(seq, (item) => ({ ...item, body, edited: true }))
    const { error } = await createClient().rpc('edit_message', { p_community: communityId, p_chat: chatId, p_seq: seq, p_body: body })
    if (error) {
      update(seq, (item) => ({ ...item, body: message.body, edited: message.edited }))
      setNotice(t.chats.notAllowed)
    }
  }

  // Deleted with its comments (asked first); the server also deletes the pictures' files.
  async function remove(message: ChatMessage) {
    if (!chatId || message.seq === null || !window.confirm(t.chats.deleteConfirm)) return
    const result = await deleteMessageAction(community, chatId, message.seq)
    if (result) return setNotice(result.error)
    setItems((current) => {
      // The post, then every comment under it, then theirs (the broadcast also lists them).
      const gone = new Set([message.seq])
      let grew = true
      while (grew) {
        grew = false
        for (const item of current) {
          if (item.seq !== null && item.replyTo && gone.has(item.replyTo.seq) && !gone.has(item.seq)) {
            gone.add(item.seq)
            grew = true
          }
        }
      }
      return current.filter((item) => item.seq === null || !gone.has(item.seq))
    })
  }

  const loadDetails = useCallback(
    async (seq: number): Promise<ReactionDetail[]> => {
      if (!chatId) return []
      const { data } = await createClient().rpc('reaction_details', { p_community: communityId, p_chat: chatId, p_seq: seq })
      return (data ?? []).map((row) => ({ userId: row.user_id, username: row.username, emoji: row.emoji }))
    },
    [chatId, communityId],
  )

  // The full picture, signed when tapped.
  async function openImage(message: ChatMessage) {
    if (!message.photo) {
      if (message.imageSrc) setViewing({ src: message.imageSrc, verified: message.verified, date: message.verifiedDate })
      return
    }
    const urls = await signPaths(createClient(), [message.photo.path])
    const src = urls.get(message.photo.path)
    if (src) setViewing({ src, verified: message.verified, date: message.verifiedDate })
  }

  function press(message: ChatMessage, event: PointerEvent<HTMLElement>) {
    const timer = window.setTimeout(() => setSelected(message), LONG_PRESS_MS)
    const clear = () => window.clearTimeout(timer)
    event.currentTarget.addEventListener('pointerup', clear, { once: true })
    event.currentTarget.addEventListener('pointercancel', clear, { once: true })
  }

  const canWrite = rules.post && !blocked

  return (
    <>
      <div
        ref={scroller}
        className={scrollArea}
        onScroll={(event) => {
          if (event.currentTarget.scrollTop < OLDER_AT_PX) void loadOlder()
        }}
      >
        {older ? <p className="pt-4 text-center text-[13px] text-muted">{t.chats.loadingOlder}</p> : null}
        <ol className="flex flex-col gap-5 px-4 py-4 sm:px-8 lg:px-10">
          {items.map((message) => (
            <li
              key={message.id}
              className="flex gap-3 pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]"
              style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 96px' }}
              onContextMenu={(event) => {
                event.preventDefault()
                if (message.seq !== null) setSelected(message)
              }}
              onPointerDown={(event) => message.seq !== null && press(message, event)}
            >
              {message.authorId ? (
                <Link href={profileHref(message.authorId)} aria-label={message.author}>
                  <Avatar name={message.author} seed={message.authorId} />
                </Link>
              ) : (
                <Avatar name={message.author} seed={message.mine ? 'me' : message.author} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[16px]">
                  {message.authorId ? (
                    <Link href={profileHref(message.authorId)} className="font-bold text-ink hover:underline">
                      {message.author}
                    </Link>
                  ) : (
                    <span className="font-bold">{message.author}</span>
                  )}
                  {message.authorStatus ? <span className="ml-1 text-[14px] text-ink-soft">({message.authorStatus})</span> : null}
                  <span className="ml-2 text-[13px] text-muted">
                    {message.state === 'sent' ? formatPostTime(message.createdAt) : null}
                    {message.edited ? ` · ${t.chats.edited}` : null}
                  </span>
                </p>
                {message.replyTo ? (
                  <p className="mt-1 truncate border-l-2 border-line-strong pl-2.5 text-[14px] text-muted">
                    {message.replyTo.author}: {message.replyTo.body}
                  </p>
                ) : null}
                {message.body ? <p className={`mt-1 text-[16px] leading-normal whitespace-pre-wrap break-words ${message.state === 'sent' ? '' : 'opacity-60'}`}>{message.body}</p> : null}
                {message.image ? (
                  <figure className="mt-2 w-fit max-w-full">
                    <button type="button" onClick={() => void openImage(message)} aria-label={t.chats.picture} className="block overflow-hidden rounded-xl bg-sunken">
                      {message.imageSrc ? (
                        // A signed thumbnail (private bucket), or the picked image while sending.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={message.imageSrc}
                          alt={message.verified ? t.chats.takenInApp : t.chats.picture}
                          draggable={false}
                          width={message.photo?.width ?? undefined}
                          height={message.photo?.height ?? undefined}
                          loading="lazy"
                          decoding="async"
                          style={{ maxHeight: IMAGE_MAX_HEIGHT_PX }}
                          className={`h-auto w-auto max-w-full object-contain ${message.state === 'sent' ? '' : 'opacity-60'}`}
                        />
                      ) : (
                        <span
                          className="block w-64 max-w-full"
                          style={{ aspectRatio: message.photo?.width && message.photo.height ? `${message.photo.width} / ${message.photo.height}` : '4 / 3', maxHeight: IMAGE_MAX_HEIGHT_PX }}
                        />
                      )}
                    </button>
                    {message.verified ? (
                      <figcaption className="mt-1 text-[13px] font-semibold text-accent">
                        ✓ {t.chats.takenInApp}
                        {message.verifiedDate ? ` · ${message.verifiedDate}` : ''}
                      </figcaption>
                    ) : null}
                  </figure>
                ) : null}
                {message.state === 'sending' ? <p className="mt-1 text-[13px] text-muted">{t.chats.sending}</p> : null}
                {message.state === 'failed' ? (
                  <button type="button" onClick={() => void deliver(message)} className="mt-1 text-[13px] font-semibold text-danger hover:underline">
                    {message.image ? t.chats.pictureFailed : t.chats.notSent}
                  </button>
                ) : null}
                {message.reactions.length > 0 ? (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {message.reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        type="button"
                        aria-pressed={reaction.mine}
                        disabled={!rules.react || blocked}
                        onClick={() => react(message, reaction.mine ? null : reaction.emoji)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[14px] ${reaction.mine ? 'border-accent bg-accent/10' : 'border-line'}`}
                      >
                        {reaction.emoji} {reaction.count}
                      </button>
                    ))}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        {notice ? <p className="px-4 pb-2 text-[14px] font-medium text-ink-soft sm:px-8">{notice}</p> : null}
      </div>

      {blocked ? (
        <p className="shrink-0 border-t border-line bg-sunken px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[15px] text-muted">{t.chats.writingBlocked}</p>
      ) : rules.post ? (
        <form onSubmit={send} className="shrink-0 border-t border-line bg-canvas px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
          {replying || editing ? (
            <p className="mb-2 flex items-center gap-2 rounded-xl bg-rail py-1.5 pr-1 pl-3 text-[14px]">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{editing ? t.chats.editing : t.chats.commentOn(replying?.author ?? '')}</span>
                {replying ? <span className="text-muted"> · {replying.body || t.chats.picture}</span> : null}
              </span>
              <button
                type="button"
                aria-label={editing ? t.chats.cancelEdit : t.chats.cancelComment}
                onClick={() => (editing ? stopEdit() : setReplying(null))}
                className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-soft-hover"
              >
                <Icon name="x" className="size-4" />
              </button>
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            {rules.images && !editing ? (
              <button
                type="button"
                aria-label={t.chats.addPicture}
                onClick={() => setPicture(true)}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-rail text-ink hover:bg-soft-hover"
              >
                <Icon name="plus" />
              </button>
            ) : null}
            <textarea
              ref={input}
              value={draft}
              rows={1}
              maxLength={MESSAGE_MAX}
              onChange={(event) => {
                setDraft(event.target.value)
                event.target.style.height = 'auto'
                event.target.style.height = `${event.target.scrollHeight}px`
              }}
              placeholder={t.chats.placeholder}
              aria-label={t.chats.message}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-line-strong bg-canvas px-4 py-2.5 text-[16px] outline-none focus:border-accent"
            />
            <button
              type="submit"
              aria-label={t.chats.send}
              disabled={!draft.trim() && !(editing?.image)}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover disabled:bg-rail disabled:text-ink/40"
            >
              <Icon name="send" className="size-5" />
            </button>
          </div>
        </form>
      ) : null}

      {selected && selected.seq !== null ? (
        <PostSheet
          message={selected}
          onClose={() => setSelected(null)}
          onCopied={() => setNotice(t.chats.copied)}
          onReply={rules.comment && canWrite && !selected.system ? () => startComment(selected) : null}
          onReact={rules.react && !blocked && !selected.system ? (emoji) => react(selected, emoji) : null}
          onEdit={rules.edit && canWrite && selected.mine ? () => startEdit(selected) : null}
          onDelete={rules.remove && (selected.mine || isAdmin) ? () => void remove(selected) : null}
          loadDetails={selected.reactions.length > 0 ? () => loadDetails(selected.seq as number) : null}
        />
      ) : null}

      {picture ? <PictureSheet communityId={communityId} onClose={() => setPicture(false)} onPick={(shot) => void sendPicture(shot)} /> : null}
      {viewing ? <ImageViewer {...viewing} onClose={() => setViewing(null)} /> : null}
    </>
  )
}

// send_message's answer: {seq, created_at}.
function savedOf(data: unknown): { seq: number; createdAt: string } | null {
  if (typeof data !== 'object' || data === null) return null
  const { seq, created_at: createdAt } = data as Record<string, unknown>
  return Number.isSafeInteger(seq) && typeof createdAt === 'string' ? { seq: seq as number, createdAt } : null
}
