'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { t } from '@/lib/i18n'
import { leaveChat } from '../hidden'

const choices = [
  { id: 'delete', label: t.leave.deleteBlock, block: true },
  { id: 'block', label: t.leave.leaveBlock, block: true },
  { id: 'leave', label: t.leave.leaveChat, block: false },
] as const

export function LeaveChat({ community, chatId, listHref }: { community: string; chatId: string; listHref: string }) {
  const router = useRouter()
  const [picked, setPicked] = useState<string | null>(null)

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex-1" />
      <ul className="border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)]">
        {choices.map((choice) => (
          <li key={choice.id} className="border-b border-line">
            <button
              type="button"
              aria-pressed={picked === choice.id}
              onClick={() => {
                setPicked(choice.id)
                leaveChat(community, chatId, choice.block)
                router.replace(listHref)
              }}
              className={`block w-full px-5 py-4 text-left text-[17px] font-semibold hover:bg-sunken ${choice.id === 'delete' ? 'text-danger' : 'text-ink'}`}
            >
              {choice.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
