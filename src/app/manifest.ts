import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SoMe',
    short_name: 'SoMe',
    // Not `/`: on the main domains that is the WordPress site (client guide 261123). The community
    // list opens the app for a logged-in login, and sends anyone else to /login.
    start_url: '/communities',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    // Made from public/icons/logo.png. Maskable = white background + padding for Android's circle/squircle crop.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
