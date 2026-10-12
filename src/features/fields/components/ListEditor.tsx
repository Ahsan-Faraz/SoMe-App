'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { LIST_LABEL_MAX } from '@/lib/limits'
import { saveListAction, type ChoiceInput } from '../actions'
import type { Choice, ChoiceList } from '../types'
import { ChoiceRows } from './ChoiceRows'

// The Status or District list (D2): rename, reorder, add, retire. One save for the whole list.
export function ListEditor({ community, list, choices }: { community: string; list: ChoiceList; choices: readonly (Choice & { people?: 1 | 2 })[] }) {
  const [items, setItems] = useState<ChoiceInput[]>(() => choices.map(({ id, label, active, people }) => ({ id, label, active, people: people ?? 1 })))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="mx-auto grid max-w-xl grid-cols-1 gap-4 px-4 py-6 sm:px-8"
      onSubmit={(event) => {
        event.preventDefault()
        if (!event.currentTarget.reportValidity()) return
        setError(null)
        startTransition(async () => {
          const result = await saveListAction(community, list, items)
          if (result) setError(result.error)
        })
      }}
    >
      <p className="text-[15px] text-ink-soft">{t.builder.listHint[list]}</p>
      <ChoiceRows items={items} onChange={setItems} maxLength={LIST_LABEL_MAX} withPeople={list === 'status'} />
      {error ? (
        <p role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="max-w-sm">
        {pending ? t.builder.saving : t.builder.save}
      </Button>
    </form>
  )
}
