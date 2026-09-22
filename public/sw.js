// No fetch handler on purpose: /_next/static is already immutable in the HTTP cache,
// and a fetch handler would make every navigation wait for the worker to boot.
// HTML, RSC payloads, API and messages must never be cached here (performance.mdc).

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
