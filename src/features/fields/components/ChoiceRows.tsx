'use client'

import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n'
import type { ChoiceInput } from '../actions'

const input = 'h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] text-ink outline-none focus:border-accent'
const iconButton = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-hover disabled:opacity-30'

// An ordered list of choices: rename, move, add. Saved choices are retired, never removed, so
// profiles that picked them keep them; a choice added in this edit can still be dropped.
// `extra` adds more to each row (the Status list: its people).
export function ChoiceRows<Item extends ChoiceInput>({
  items,
  onChange,
  maxLength,
  blank,
  extra,
}: {
  items: Item[]
  onChange: (items: Item[]) => void
  maxLength: number
  blank: () => Item
  extra?: (item: Item, update: (patch: Partial<Item>) => void) => ReactNode
}) {
  const replace = (index: number, next: Item) => onChange(items.map((item, i) => (i === index ? next : item)))
  const move = (index: number, by: -1 | 1) => {
    const next = [...items]
    const [item] = next.splice(index, 1)
    if (item) next.splice(index + by, 0, item)
    onChange(next)
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      <ol className="grid grid-cols-1 gap-2">
        {items.map((item, index) => {
          const name = item.label || t.builder.choice(index + 1)
          return (
            <li key={item.id ?? `new-${index}`} className={`flex flex-wrap items-center gap-1 rounded-2xl border border-line p-1.5 ${item.active ? '' : 'bg-sunken'}`}>
              <input
                value={item.label}
                onChange={(event) => replace(index, { ...item, label: event.target.value })}
                maxLength={maxLength}
                required
                aria-label={t.builder.choice(index + 1)}
                className={`${input} ${item.active ? '' : 'text-muted line-through'}`}
              />
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t.builder.moveUp(name)} className={iconButton}>
                <Icon name="chevronRight" className="size-5 -rotate-90" />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={t.builder.moveDown(name)} className={iconButton}>
                <Icon name="chevronRight" className="size-5 rotate-90" />
              </button>
              {item.id ? (
                <button
                  type="button"
                  onClick={() => replace(index, { ...item, active: !item.active })}
                  className="h-11 shrink-0 rounded-full px-3 text-[14px] font-semibold text-accent hover:bg-hover"
                >
                  {item.active ? t.builder.retire : t.builder.restore}
                </button>
              ) : (
                <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={t.builder.remove(name)} className={iconButton}>
                  <Icon name="trash" className="size-5" />
                </button>
              )}
              {extra ? <div className="basis-full px-2 pb-1">{extra(item, (patch) => replace(index, { ...item, ...patch }))}</div> : null}
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        onClick={() => onChange([...items, blank()])}
        className="flex h-11 items-center gap-2 justify-self-start rounded-full px-3 text-[15px] font-semibold text-accent hover:bg-hover"
      >
        <Icon name="plus" className="size-5" />
        {t.builder.addChoice}
      </button>
    </div>
  )
}
