import type { Metadata, Viewport } from 'next'
import { ServiceWorker } from '@/components/ServiceWorker'
import { themeScript } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'SoMe',
  description: 'Community chat and profiles',
  appleWebApp: { capable: true, title: 'SoMe', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning className="bg-canvas font-sans text-ink antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
