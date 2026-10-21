'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import type { ChatMessage } from '../types'

const EmojiPicker = dynamic(() => import('./EmojiPicker').then((mod) => mod.EmojiPicker), { ssr: false })

const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export type ReactionDetail = { userId: string; username: string; emoji: string }

// B3: the long-press menu of a post. React (one reaction per person, D20: the same emoji again takes
// it back), Details (who reacted), Comment, Edit (own posts), Delete (own posts, or as the group's
// admin), Copy. Each action is offered only when the chat's rules allow it.
export function PostSheet({
  message,
  onClose,
  onCopied,
  onReply,
  onReact,
  onEdit,
  onDelete,
  loadDetails,
}: {
  message: ChatMessage
  onClose: () => void
  onCopied: () => void
  onReply: (() => void) | null
  onReact: ((emoji: string | null) => void) | null
  onEdit: (() => void) | null
  onDelete: (() => void) | null
  loadDetails: (() => Promise<ReactionDetail[]>) | null
}) {
  const [more, setMore] = useState(false)
  const [details, setDetails] = useState<ReactionDetail[] | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const mine = message.reactions.find((reaction) => reaction.mine)?.emoji ?? null

  useEffect(() => {
    if (!showDetails || !loadDetails) return
    let current = true
    void loadDetails().then((rows) => current && setDetails(rows))
    return () => {
      current = false
    }
  }, [showDetails, loadDetails])

  const pick = (emoji: string) => {
    onReact?.(emoji === mine ? null : emoji)
    onClose()
  }

  const rows: { label: string; danger?: boolean; run: () => void }[] = [
    ...(loadDetails ? [{ label: t.chats.details, run: () => setShowDetails(true) }] : []),
    ...(onReply ? [{ label: t.chats.reply, run: () => (onReply(), onClose()) }] : []),
    ...(onEdit ? [{ label: t.chats.edit, run: () => (onEdit(), onClose()) }] : []),
    ...(message.body ? [{ label: t.chats.copy, run: () => (void navigator.clipboard.writeText(message.body).then(onCopied), onClose()) }] : []),
    ...(onDelete ? [{ label: t.chats.delete, danger: true, run: () => (onDelete(), onClose()) }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="w-full select-none rounded-t-3xl bg-canvas p-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl lg:h-full lg:max-w-md lg:overflow-y-auto lg:rounded-none"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="mx-auto mt-1 block h-1 w-10 rounded-full bg-line-strong lg:hidden" />
        {showDetails ? (
          <div className="px-2 py-2">
            <h2 className="px-2 pb-2 text-[17px] font-bold">{t.chats.details}</h2>
            {details === null ? (
              <p className="px-2 py-4 text-[15px] text-muted">…</p>
            ) : details.length === 0 ? (
              <p className="px-2 py-4 text-[15px] text-muted">{t.chats.noReactions}</p>
            ) : (
              <ul className="max-h-[50dvh] divide-y divide-line overflow-y-auto">
                {details.map((row) => (
                  <li key={row.userId} className="flex items-center gap-3 px-2 py-2.5 text-[16px]">
                    <span className="text-[22px]">{row.emoji}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{row.username}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            {onReact ? (
              <div className="mx-2 my-2 flex justify-around rounded-2xl bg-rail px-2 py-2 text-2xl">
                {emojis.map((emoji) => (
                  <button key={emoji} type="button" aria-pressed={emoji === mine} className={`rounded-full px-2 py-1 hover:bg-canvas ${emoji === mine ? 'bg-canvas' : ''}`} onClick={() => pick(emoji)}>
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label={t.chats.moreEmoji}
                  title={t.chats.moreEmoji}
                  className="grid size-10 place-items-center rounded-full text-ink hover:bg-canvas"
                  aria-expanded={more}
                  onClick={() => setMore((value) => !value)}
                >
                  <Icon name="plus" className="size-5" />
                </button>
              </div>
            ) : null}
            {more ? <EmojiPicker onPick={pick} /> : null}
            {more
              ? null
              : rows.map((row) => (
                  <button
                    key={row.label}
                    type="button"
                    className={`block w-full rounded-xl px-4 py-3 text-left text-[16px] font-medium hover:bg-hover ${row.danger ? 'text-danger' : ''}`}
                    onClick={row.run}
                  >
                    {row.label}
                  </button>
                ))}
          </>
        )}
        <button type="button" className="mt-2 w-full rounded-xl bg-rail px-4 py-3 text-[16px] font-semibold text-ink hover:bg-soft-hover" onClick={onClose}>
          {t.chats.cancel}
        </button>
      </div>
    </div>
  )
}
