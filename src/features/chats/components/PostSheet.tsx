'use client'

import { t } from '@/lib/i18n'
import type { ChatMessage } from '../types'

const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export function PostSheet({
  message,
  chatId,
  canEdit,
  canDelete,
  onClose,
  onCopied,
  onReply,
  onNotice,
}: {
  message: ChatMessage
  chatId: string
  canEdit: boolean
  canDelete: boolean
  onClose: () => void
  onCopied: () => void
  onReply: (author: string) => void
  onNotice: (text: string) => void
}) {
  const rows = [
    t.chats.whoReacted,
    t.chats.details,
    ...(canEdit ? [t.chats.edit] : []),
    ...(canDelete ? [t.chats.delete] : []),
    t.chats.reply,
    t.chats.copy,
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full rounded-t-3xl bg-canvas p-2 pb-6 shadow-2xl lg:h-full lg:max-w-md lg:overflow-y-auto lg:rounded-none" onClick={(event) => event.stopPropagation()}>
        <span className="mx-auto mt-1 block h-1 w-10 rounded-full bg-black/15 lg:hidden" />
        <div className="mx-2 my-2 flex justify-around rounded-2xl bg-rail px-2 py-2 text-2xl">
          {emojis.map((emoji) => (
            <button key={emoji} type="button" className="rounded-full px-2 py-1 hover:bg-canvas" onClick={onClose}>
              {emoji}
            </button>
          ))}
        </div>
        {rows.map((label) => (
          <button
            key={label}
            type="button"
            className={`block w-full rounded-xl px-4 py-3 text-left text-[16px] font-medium hover:bg-black/5 ${label === t.chats.delete ? 'text-danger' : ''}`}
            onClick={() => {
              if (label === t.chats.copy) {
                void navigator.clipboard.writeText(message.body).then(onCopied)
              }
              if (label === t.chats.reply) onReply(message.author)
              if (label !== t.chats.copy && label !== t.chats.reply) onNotice(`${label} · ${chatId}`)
              onClose()
            }}
          >
            {label}
          </button>
        ))}
        <button type="button" className="mt-2 w-full rounded-xl bg-rail px-4 py-3 text-[16px] font-semibold text-ink hover:bg-soft-hover" onClick={onClose}>
          {t.chats.cancel}
        </button>
      </div>
    </div>
  )
}
