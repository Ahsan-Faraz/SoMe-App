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
// src = a profile icon thumbnail; without one, the initials on a color from the seed.
export function Avatar({
  name,
  seed = name,
  shape = 'circle',
  size = 'md',
  src = null,
}: {
  name: string
  seed?: string
  shape?: 'circle' | 'square'
  size?: 'sm' | 'md' | 'lg'
  src?: string | null
}) {
  const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-20 text-2xl' }
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-lg'
  if (src) {
    // A Storage thumbnail, already small: no image optimizer round trip.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" decoding="async" className={`shrink-0 object-cover ${sizes[size]} ${radius}`} />
  }
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
