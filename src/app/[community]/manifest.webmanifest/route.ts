import type { MetadataRoute } from 'next'
import { getCommunity } from '@/features/communities/queries'

// The installed app of one community (D30): its name, opening at its start page. Icons stay the
// platform's until communities have their own. The same shape as app/manifest.ts.
export async function GET(_: Request, { params }: RouteContext<'/[community]/manifest.webmanifest'>) {
  const { community } = await params
  const info = await getCommunity(community)
  if (!info) return new Response(null, { status: 404 })

  const manifest: MetadataRoute.Manifest = {
    name: info.name,
    short_name: info.name,
    start_url: `/${info.slug}`,
    scope: `/${info.slug}`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  return Response.json(manifest, { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } })
}
