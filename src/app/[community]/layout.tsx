import type { Metadata } from 'next'
import { getCommunity } from '@/features/communities/queries'

// Each community shows under its own name (D30): the browser tab, the home screen ("Add to Home
// Screen" on iOS) and the installed app (its manifest). The community row is cached.
export async function generateMetadata({ params }: LayoutProps<'/[community]'>): Promise<Metadata> {
  const { community } = await params
  const info = await getCommunity(community)
  if (!info) return {}
  return {
    title: info.name,
    appleWebApp: { capable: true, title: info.name, statusBarStyle: 'default' },
    manifest: `/${info.slug}/manifest.webmanifest`,
  }
}

export default function CommunityLayout({ children }: LayoutProps<'/[community]'>) {
  return children
}
