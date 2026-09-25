import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const base =
  'inline-flex h-12 w-full items-center justify-center rounded-xl border border-transparent px-5 text-[16px] font-semibold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-sm hover:bg-accent-hover active:bg-accent-hover',
  secondary: 'bg-soft text-ink hover:bg-soft-hover active:bg-soft-hover',
  ghost: 'text-ink hover:bg-black/5',
}

export function buttonClass(variant: Variant = 'primary'): string {
  return `${base} ${variants[variant]}`
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={`${buttonClass(variant)} ${className}`} {...props} />
}
