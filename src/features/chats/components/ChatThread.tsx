'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { scrollArea } from '@/components/ui/Screen'
import { t } from '@/lib/i18n'
import type { Album } from '@/features/albums/types'
import type { ChatMessage, ChatRules, Reaction } from '../types'

const PostSheet = dynamic(() => import('./PostSheet').then((mod) => mod.PostSheet), { ssr: false })
const PictureSheet = dynamic(() => import('./PictureSheet').then((mod) => mod.PictureSheet), { ssr: false })

const LONG_PRESS_MS = 450

export function ChatThread({
  community,
  chatId,
  backHref,
  messages,
  isAdmin,
  rules,
  viewerId,
  albums,
}: {
  community: string
  chatId: string
  backHref: string
  messages: ChatMessage[]
  isAdmin: boolean
  rules: ChatRules
  viewerId: string
  albums: Album[]
}) {
  const [items, setItems] = useState(messages)
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<ChatMessage | null>(null)
  const [picture, setPicture] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [replying, setReplying] = useState<ChatMessage | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const profileHref = (userId: string) => `/${community}/profiles/${userId}?back=${encodeURIComponent(backHref)}`

  // Newest is lowest: open at the bottom, and follow new posts.
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    element.scrollTop = element.scrollHeight
    // Off-screen posts use an estimated height (content-visibility); settle once they are drawn.
    const frame = requestAnimationFrame(() => (element.scrollTop = element.scrollHeight))
    return () => cancelAnimationFrame(frame)
  }, [items.length])

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    setItems((current) => [
      ...current,
      {
        id: `local-${current.length}`,
        author: t.chats.you,
        authorId: null,
        mine: true,
        body,
        timeLabel: t.chats.justNow,
        reactions: [],
        replyTo: replying ? { author: replying.author, body: replying.body || t.chats.addPicture } : null,
        image: false,
        imageSrc: null,
        verified: false,
        verifiedDate: null,
      },
    ])
    setDraft('')
    setReplying(null)
  }

  function startComment(message: ChatMessage) {
    setReplying(message)
    input.current?.focus()
  }

  // Optimistic: flips the viewer's own reaction; the real version also writes it browser → Supabase.
  function react(messageId: string, emoji: string) {
    setItems((current) => current.map((message) => (message.id === messageId ? { ...message, reactions: toggle(message.reactions, emoji) } : message)))
  }

  function press(message: ChatMessage, event: PointerEvent<HTMLElement>) {
    const timer = window.setTimeout(() => setSelected(message), LONG_PRESS_MS)
    const clear = () => window.clearTimeout(timer)
    event.currentTarget.addEventListener('pointerup', clear, { once: true })
    event.currentTarget.addEventListener('pointercancel', clear, { once: true })
  }

  return (
    <>
      <div ref={scroller} className={scrollArea}>
        <ol className="flex flex-col gap-5 px-4 py-4 sm:px-8 lg:px-10">
          {items.map((message) => (
            <li
              key={message.id}
              className="flex gap-3 pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]"
              style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 96px' }}
              onContextMenu={(event) => {
                event.preventDefault()
                setSelected(message)
              }}
              onPointerDown={(event) => press(message, event)}
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
                  <span className="ml-2 text-[13px] text-muted">{message.timeLabel}</span>
                </p>
                {message.replyTo ? (
                  <p className="mt-1 truncate border-l-2 border-line-strong pl-2.5 text-[14px] text-muted">
                    {message.replyTo.author}: {message.replyTo.body}
                  </p>
                ) : null}
                {message.body ? <p className="mt-1 whitespace-pre-wrap text-[16px] leading-normal">{message.body}</p> : null}
                {message.image ? (
                  <figure className="mt-2 max-w-md">
                    {message.imageSrc ? (
                      // Captures are data URLs, which next/image does not serve.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={message.imageSrc}
                        alt={message.verified ? t.chats.verified : t.chats.addPicture}
                        draggable={false}
                        className="aspect-video w-full rounded-xl object-cover"
                      />
                    ) : (
                      <Image
                        src="/community/ride.png"
                        alt={message.verified ? t.chats.verified : t.chats.addPicture}
                        width={640}
                        height={360}
                        sizes="(min-width: 640px) 28rem, 90vw"
                        draggable={false}
                        className="aspect-video w-full rounded-xl object-cover"
                      />
                    )}
                    {message.verified ? (
                      <figcaption className="mt-1 text-[13px] font-semibold text-accent">
                        ✓ {t.chats.verified}
                        {message.verifiedDate ? ` · ${message.verifiedDate}` : ''}
                      </figcaption>
                    ) : message.imageSrc ? (
                      <figcaption className="mt-1 text-[13px] text-muted">{message.verifiedDate}</figcaption>
                    ) : null}
                  </figure>
                ) : null}
                {message.reactions.length > 0 ? (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {message.reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        type="button"
                        aria-pressed={reaction.mine}
                        disabled={!rules.react}
                        onClick={() => react(message.id, reaction.emoji)}
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

      {rules.post ? (
        <form onSubmit={send} className="shrink-0 border-t border-line bg-canvas px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
          {replying ? (
            <p className="mb-2 flex items-center gap-2 rounded-xl bg-rail py-1.5 pr-1 pl-3 text-[14px]">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{t.chats.commentOn(replying.author)}</span>
                <span className="text-muted"> · {replying.body || t.chats.addPicture}</span>
              </span>
              <button
                type="button"
                aria-label={t.chats.cancelComment}
                onClick={() => setReplying(null)}
                className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-soft-hover"
              >
                <Icon name="x" className="size-4" />
              </button>
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <button
              type="button"
              aria-label={t.chats.addPicture}
              onClick={() => setPicture(true)}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-rail text-ink hover:bg-soft-hover"
            >
              <Icon name="plus" />
            </button>
            <textarea
              ref={input}
              value={draft}
              rows={1}
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
              disabled={!draft.trim()}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover disabled:bg-rail disabled:text-ink/40"
            >
              <Icon name="send" className="size-5" />
            </button>
          </div>
        </form>
      ) : null}

      {selected ? (
        <PostSheet
          message={selected}
          chatId={chatId}
          canEdit={(selected.mine && rules.edit) || isAdmin}
          canDelete={selected.mine || isAdmin}
          onClose={() => setSelected(null)}
          onCopied={() => setNotice(t.chats.copied)}
          onReply={rules.comment && rules.post ? () => startComment(selected) : null}
          onReact={rules.react ? (emoji) => react(selected.id, emoji) : null}
          onNotice={setNotice}
        />
      ) : null}

      {picture ? (
        <PictureSheet
          community={community}
          viewerId={viewerId}
          albums={albums}
          onClose={() => setPicture(false)}
          onPick={(shot) => {
            setItems((current) => [
              ...current,
              {
                id: `local-${current.length}`,
                author: t.chats.you,
                authorId: null,
                mine: true,
                body: '',
                timeLabel: t.chats.justNow,
                reactions: [],
                replyTo: null,
                image: true,
                imageSrc: shot.src,
                verified: shot.verified,
                verifiedDate: shot.date,
              },
            ])
            setPicture(false)
          }}
        />
      ) : null}
    </>
  )
}

function toggle(reactions: Reaction[], emoji: string): Reaction[] {
  const found = reactions.find((reaction) => reaction.emoji === emoji)
  if (!found) return [...reactions, { emoji, count: 1, mine: true }]
  const count = found.count + (found.mine ? -1 : 1)
  return count === 0 ? reactions.filter((reaction) => reaction !== found) : reactions.map((reaction) => (reaction === found ? { ...reaction, count, mine: !found.mine } : reaction))
}
