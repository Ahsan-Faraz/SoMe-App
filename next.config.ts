import type { NextConfig } from 'next'
import { ownDomainHosts } from './src/lib/domains'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  // The platform's `/` opens its default community; a community's own domain (D30) keeps `/` for
  // itself (src/proxy.ts serves it there).
  async redirects() {
    const own = ownDomainHosts().map((host) => host.replace(/[.]/g, '\\.'))
    return [
      {
        source: '/',
        destination: `/${process.env.DEFAULT_COMMUNITY ?? 'biking-stockholm'}`,
        permanent: false,
        ...(own.length ? { missing: [{ type: 'host' as const, value: `^(${own.join('|')})$` }] } : {}),
      },
    ]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ]
  },
}

export default nextConfig
