/*
 * Obscura service worker.
 *
 * Deliberately conservative: this is an internal system where showing stale
 * bookings would be worse than showing a spinner. So:
 *   - static build assets  -> cache first (they are content-hashed)
 *   - everything else      -> network first, cache only as an offline fallback
 *   - anything non-GET, any Supabase call, any API route -> never touched
 *
 * The one rule that matters more than any of that: never cache a response that
 * is not a success. An earlier version cached whatever came back, including
 * the 404 a build asset briefly returns while a deploy swaps over. That 404
 * then lived in a cache-first bucket whose version never changed, so the chunk
 * 404'd from cache on every load afterwards and the app died with "a
 * client-side exception has occurred" — permanently, and only for whoever
 * happened to load the page at the wrong second.
 */

/*
 * Bumping this deletes every cache from the version before it, which is the
 * escape hatch for anyone already holding a poisoned entry. Bump it whenever
 * the caching rules change.
 */
const VERSION = 'obscura-v2'
const STATIC_CACHE = `${VERSION}-static`
const PAGE_CACHE = `${VERSION}-pages`
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, '/manifest.webmanifest']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

/**
 * A response worth keeping.
 *
 * `basic` means same-origin and fully readable; an opaque cross-origin reply
 * cannot be inspected, so its status is always 0 and caching it is a guess.
 * Anything that is not a plain 200 gets used once and forgotten.
 */
function worthCaching(response) {
  return Boolean(response) && response.ok && response.status === 200 && response.type === 'basic'
}

function putIfGood(cacheName, request, response) {
  if (!worthCaching(response)) return
  const copy = response.clone()
  caches.open(cacheName).then((cache) => cache.put(request, copy)).catch(() => undefined)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/auth/')) return
  // The worker's own script must always come from the network, or a broken
  // one could never replace itself.
  if (url.pathname === '/sw.js') return

  // Hashed build output — safe to serve straight from cache.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit
        return fetch(request).then((res) => {
          putIfGood(STATIC_CACHE, request, res)
          return res
        })
      }),
    )
    return
  }

  // Pages: always try the network, fall back to the last good copy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          putIfGood(PAGE_CACHE, request, res)
          return res
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit || caches.match(OFFLINE_URL))
            .then((hit) => hit || new Response('Offline', { status: 503 })),
        ),
    )
  }
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()

  // The page asks for this when a script fails to load: throw everything away
  // so the next load starts from the network.
  if (event.data === 'purge') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    )
  }
})
