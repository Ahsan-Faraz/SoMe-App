'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useState, type FormEvent, type PointerEvent } from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import type { ChatMessage } from '../types'

const PostSheet = dynamic(() => import('./PostSheet').then((mod) => mod.PostSheet), { ssr: false })

const LONG_PRESS_MS = 450

export function ChatThread({
  community,
  chatId,
  messages,
  isAdmin,
}: {
  community: string
  chatId: string
  messages: ChatMessage[]
  isAdmin: boolean
}) {
  const [items, setItems] = useState(messages)
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<ChatMessage | null>(null)
  const [picture, setPicture] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    setItems((current) => [
      ...current,
      { id: `local-${current.length}`, author: t.chats.you, authorId: null, mine: true, body, timeLabel: t.chats.justNow, reactions: null, comment: null, image: false },
    ])
    setDraft('')
  }

  function press(message: ChatMessage, event: PointerEvent<HTMLElement>) {
    const timer = window.setTimeout(() => setSelected(message), LONG_PRESS_MS)
    const clear = () => window.clearTimeout(timer)
    event.currentTarget.addEventListener('pointerup', clear, { once: true })
    event.currentTarget.addEventListener('pointercancel', clear, { once: true })
  }

  return (
    <>
      <ol className="flex flex-1 flex-col gap-5 px-4 py-4 sm:px-8 lg:px-10">
        {items.map((message) => (
          <li
            key={message.id}
            className="flex gap-3"
            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 96px' }}
            onContextMenu={(event) => {
              event.preventDefault()
              setSelected(message)
            }}
            onPointerDown={(event) => press(message, event)}
          >
            {message.authorId ? (
              <Link href={`/${community}/profiles/${message.authorId}`} aria-label={message.author}>
                <Avatar name={message.author} seed={message.authorId} />
              </Link>
            ) : (
              <Avatar name={message.author} seed={message.mine ? 'me' : message.author} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[16px]">
                {message.authorId ? (
                  <Link href={`/${community}/profiles/${message.authorId}`} className="font-bold text-ink hover:underline">
                    {message.author}
                  </Link>
                ) : (
                  <span className="font-bold">{message.author}</span>
                )}
                <span className="ml-2 text-[13px] text-muted">{message.timeLabel}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[16px] leading-normal">{message.body}</p>
              {message.reactions ? (
                <p className="mt-2 inline-flex rounded-full border border-black/10 px-2.5 py-0.5 text-[14px]">{message.reactions}</p>
              ) : null}
              {message.comment ? <p className="mt-1.5 border-l-2 border-black/15 pl-3 text-[14px] text-muted">{message.comment}</p> : null}
              {message.image ? (
                <figure className="mt-2 max-w-md">
                  <Image
                    src="/community/ride.png"
                    alt={t.chats.verified}
                    width={640}
                    height={360}
                    sizes="(min-width: 640px) 28rem, 90vw"
                    className="aspect-video w-full rounded-xl object-cover"
                  />
                  <figcaption className="mt-1 text-[13px] font-semibold text-accent">✓ {t.chats.verified}</figcaption>
                </figure>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {notice ? <p className="px-4 pb-2 text-[14px] font-medium text-ink-soft sm:px-8">{notice}</p> : null}

      <form onSubmit={send} className="sticky bottom-0 flex items-end gap-2 border-t border-line bg-canvas px-3 py-2 sm:px-6 lg:px-8">
        <button
          type="button"
          aria-label={t.chats.addPicture}
          onClick={() => setPicture(true)}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-rail text-ink hover:bg-soft-hover"
        >
          <Icon name="plus" />
        </button>
        <textarea
          value={draft}
          rows={1}
          onChange={(event) => {
            setDraft(event.target.value)
            event.target.style.height = 'auto'
            event.target.style.height = `${event.target.scrollHeight}px`
          }}
          placeholder={t.chats.placeholder}
          aria-label={t.chats.message}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-black/15 bg-canvas px-4 py-2.5 text-[16px] outline-none focus:border-accent"
        />
        <button
          type="submit"
          aria-label={t.chats.send}
          disabled={!draft.trim()}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover disabled:bg-rail disabled:text-ink/40"
        >
          <Icon name="send" className="size-5" />
        </button>
      </form>

      {selected ? (
        <PostSheet
          message={selected}
          chatId={chatId}
          canEdit={selected.mine || isAdmin}
          canDelete={selected.mine || isAdmin}
          onClose={() => setSelected(null)}
          onCopied={() => setNotice(t.chats.copied)}
          onReply={(author) => setDraft(`@${author} `)}
          onNotice={setNotice}
        />
      ) : null}

      {picture ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 lg:items-stretch lg:justify-end" onClick={() => setPicture(false)}>
          <div className="w-full rounded-t-2xl bg-canvas p-2 pb-6 lg:h-full lg:max-w-md lg:rounded-none" onClick={(event) => event.stopPropagation()}>
            <p className="px-4 py-3 text-[14px] text-muted">{t.chats.cameraNote}</p>
            {[t.chats.camera, t.chats.upload, t.chats.fromAlbum].map((label) => (
              <button
                key={label}
                type="button"
                className="block w-full rounded-lg px-4 py-3 text-left text-[17px] hover:bg-sunken"
                onClick={() => {
                  setNotice(label)
                  setPicture(false)
                }}
              >
                {label}
              </button>
            ))}
            <button type="button" className="mt-1 w-full rounded-lg px-4 py-3 text-[17px] font-semibold text-accent" onClick={() => setPicture(false)}>
              {t.chats.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
