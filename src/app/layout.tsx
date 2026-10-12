import type { Metadata, Viewport } from 'next'
import { CookieConsent } from '@/components/CookieConsent'
import { ServiceWorker } from '@/components/ServiceWorker'
import { htmlLang, locale } from '@/lib/i18n'
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
    <html lang={htmlLang[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning className="bg-canvas font-sans text-ink antialiased">
        {children}
        <CookieConsent />
        <ServiceWorker />
      </body>
    </html>
  )
}
