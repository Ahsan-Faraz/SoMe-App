const colors = ['bg-sky-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-violet-600', 'bg-teal-600', 'bg-orange-600']

function colorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return colors[hash % colors.length] ?? 'bg-neutral-500'
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? '?'
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + second).toUpperCase()
}

// Groups are rounded squares and people are circles, as in Wire.
export function Avatar({
  name,
  seed = name,
  shape = 'circle',
  size = 'md',
}: {
  name: string
  seed?: string
  shape?: 'circle' | 'square'
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizes = { sm: 'size-8 text-xs', md: 'size-11 text-sm', lg: 'size-20 text-2xl' }
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-xl'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-semibold text-white ${sizes[size]} ${radius} ${colorFor(seed)}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
