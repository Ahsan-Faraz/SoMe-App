// Wire light-UI accent set. Blue is the default; the others are profile colors.
const accents = ['#0772de', '#9737af', '#148545', '#e41734', '#287d97', '#7c7621']

function colorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return accents[hash % accents.length] ?? '#0772de'
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
  const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-20 text-2xl' }
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-lg'
  return (
    <span
      style={{ backgroundColor: colorFor(seed) }}
      className={`inline-flex shrink-0 items-center justify-center font-semibold text-white ${sizes[size]} ${radius}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
