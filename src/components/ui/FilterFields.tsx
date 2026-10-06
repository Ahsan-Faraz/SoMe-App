import type { ReactNode } from 'react'
import { Icon } from './Icon'

// Building blocks shared by the G1 (profiles) and D1 (ads) filter screens.

const box = 'h-11 rounded-xl border border-line bg-canvas px-3 text-[16px] font-normal text-ink outline-none placeholder:text-muted focus:border-accent'
export const filterInput = `${box} w-full`

export function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="mb-2 text-[13px] font-bold tracking-wide text-muted uppercase">{label}</legend>
      {children}
    </fieldset>
  )
}

// Multi select as tappable chips: one tap per choice, no menu to open.
export function ChipSelect({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = value.includes(option)
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((item) => item !== option) : [...value, option])}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold ${on ? 'border-accent bg-accent text-white' : 'border-line bg-canvas text-ink hover:bg-hover'}`}
          >
            {on ? <Icon name="check" className="size-4" /> : null}
            {option}
          </button>
        )
      })}
    </div>
  )
}

// Digits only; an empty string means "no limit".
export function NumberInput({ value, onChange, placeholder, label, max }: { value: string; onChange: (value: string) => void; placeholder: string; label: string; max: number }) {
  return (
    <input
      inputMode="numeric"
      maxLength={String(max).length}
      value={value}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '')
        onChange(digits === '' ? '' : String(Math.min(Number(digits), max)))
      }}
      placeholder={placeholder}
      aria-label={label}
      className={`${box} w-24 text-center`}
    />
  )
}

export function NumberRange({
  label,
  from,
  to,
  onFrom,
  onTo,
  fromLabel,
  toLabel,
  max,
}: {
  label: string
  from: string
  to: string
  onFrom: (value: string) => void
  onTo: (value: string) => void
  fromLabel: string
  toLabel: string
  max: number
}) {
  return (
    <div className="flex items-center gap-2">
      <NumberInput value={from} onChange={onFrom} placeholder={fromLabel} label={`${label} ${fromLabel.toLowerCase()}`} max={max} />
      <span aria-hidden className="text-muted">
        –
      </span>
      <NumberInput value={to} onChange={onTo} placeholder={toLabel} label={`${label} ${toLabel.toLowerCase()}`} max={max} />
    </div>
  )
}
