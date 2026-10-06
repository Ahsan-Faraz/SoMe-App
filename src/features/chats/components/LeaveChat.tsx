'use client'

import { useRouter } from 'next/navigation'
import { t } from '@/lib/i18n'
import { leaveChat } from '../hidden'

// DM: keep the chat but stop all writing, or delete it and block the person from DMing you.
// Group: just leave.
const choices = {
  dm: [
    { id: 'keep', label: t.leave.keepBlock, remove: false, block: true, danger: false },
    { id: 'delete', label: t.leave.deleteBlock, remove: true, block: true, danger: true },
  ],
  group: [{ id: 'leave', label: t.groupInfo.leave, remove: true, block: false, danger: true }],
} as const

export function LeaveChat({ community, chatId, kind, chatHref, listHref }: { community: string; chatId: string; kind: 'dm' | 'group'; chatHref: string; listHref: string }) {
  const router = useRouter()

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex-1" />
      <ul className="mx-auto w-full max-w-xl border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] sm:mb-8 sm:overflow-hidden sm:rounded-2xl sm:border">
        {choices[kind].map((choice) => (
          <li key={choice.id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => {
                leaveChat(community, chatId, choice)
                router.replace(choice.remove ? listHref : chatHref)
              }}
              className={`block w-full px-5 py-4 text-left text-[17px] font-semibold hover:bg-sunken ${choice.danger ? 'text-danger' : 'text-ink'}`}
            >
              {choice.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
