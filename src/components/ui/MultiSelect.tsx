'use client'

import { useEffect, useRef } from 'react'
import { Icon } from './Icon'

// Multi-select drop-down: a closed field showing the choices; opens a list of checkboxes in place
// (in the page flow, so it never hides under a sticky bar).
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
}) {
  const ref = useRef<HTMLDetailsElement>(null)

  // Close when tapping anywhere else, like a native select.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const details = ref.current
      if (details?.open && !details.contains(event.target as Node)) details.open = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <div className="grid gap-1.5">
      <span className="text-[14px] font-semibold text-ink">{label}</span>
      <details ref={ref} className="group">
        <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-line-strong bg-canvas px-3 text-[16px] text-ink group-open:border-accent [&::-webkit-details-marker]:hidden">
          <span className={`min-w-0 flex-1 truncate ${value.length ? '' : 'text-muted'}`}>{value.length ? value.join(', ') : placeholder}</span>
          <Icon name="chevronRight" className="size-5 rotate-90 text-muted transition-transform group-open:-rotate-90" />
        </summary>
        <ul role="group" aria-label={label} className="mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-line bg-canvas py-1">
          {options.map((option) => (
            <li key={option}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[16px] hover:bg-hover">
                <input
                  type="checkbox"
                  checked={value.includes(option)}
                  onChange={() => onChange(options.filter((item) => (item === option ? !value.includes(item) : value.includes(item))))}
                />
                {option}
              </label>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
