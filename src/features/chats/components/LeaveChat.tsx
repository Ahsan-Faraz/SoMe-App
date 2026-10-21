'use client'

import { useState, useTransition } from 'react'
import { t } from '@/lib/i18n'
import { leaveChatAction, type LeaveMode } from '../actions'

// DM: keep the chat but stop all writing, or delete it for both; either way the other person is
// blocked (D12, D13). Group: just leave.
const choices: Record<'dm' | 'group', { mode: LeaveMode; label: string; danger: boolean }[]> = {
  dm: [
    { mode: 'keep', label: t.leave.keepBlock, danger: false },
    { mode: 'delete', label: t.leave.deleteBlock, danger: true },
  ],
  group: [{ mode: 'leave', label: t.groupInfo.leave, danger: true }],
}

export function LeaveChat({ community, chatId, kind }: { community: string; chatId: string; kind: 'dm' | 'group' }) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex-1" />
      {error ? (
        <p role="alert" className="mx-auto w-full max-w-xl px-5 pb-3 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      <ul className="mx-auto w-full max-w-xl border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] sm:mb-8 sm:overflow-hidden sm:rounded-2xl sm:border">
        {choices[kind].map((choice) => (
          <li key={choice.mode} className="border-b border-line last:border-b-0">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError('')
                  const result = await leaveChatAction(community, chatId, choice.mode)
                  if (result) setError(result.error)
                })
              }
              className={`block w-full px-5 py-4 text-left text-[17px] font-semibold hover:bg-sunken disabled:opacity-50 ${choice.danger ? 'text-danger' : 'text-ink'}`}
            >
              {choice.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
