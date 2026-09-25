import type { InputHTMLAttributes } from 'react'

export function TextField({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[14px] font-semibold text-ink">{label}</span>
      <input
        id={id}
        className="h-12 w-full rounded-xl border border-black/15 bg-canvas px-4 text-[16px] text-ink outline-none transition-colors placeholder:text-ink/40 hover:border-black/30 focus:border-accent focus:ring-2 focus:ring-accent/20"
        {...props}
      />
    </label>
  )
}
