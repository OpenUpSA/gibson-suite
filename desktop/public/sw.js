const CACHE = 'gibson-v1'
const PRECACHE = ['/', '/index.html']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Network-first for API/tile requests, cache-first for app shell
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return // skip external (tiles, OSM, GIBS)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
