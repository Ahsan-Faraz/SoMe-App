import type { InputHTMLAttributes } from 'react'

export function TextField({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-medium text-neutral-700">{label}</span>
      <input
        id={id}
        className="h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base outline-none transition-colors placeholder:text-neutral-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
        {...props}
      />
    </label>
  )
}
