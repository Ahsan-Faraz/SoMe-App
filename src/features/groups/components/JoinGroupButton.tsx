'use client'

import { useState, useTransition } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { joinGroupAction } from '../actions'

// A2/A24 "Join group" for a group with direct join: joins, then opens its chat.
export function JoinGroupButton({ community, groupId }: { community: string; groupId: string }) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  return (
    <>
      {error ? (
        <p role="alert" className="mb-2 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError('')
            const result = await joinGroupAction(community, groupId)
            if (result) setError(result.error)
          })
        }
        className={`${buttonClass('primary')} disabled:opacity-50`}
      >
        {pending ? t.groups.joining : t.groups.join}
      </button>
    </>
  )
}
