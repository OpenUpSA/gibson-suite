const CACHE = 'gibson-v6'
const PRECACHE = ['/', '/index.html']
// Data files that change with every deploy — never cache, always fetch fresh.
// layer-dates.json (timelapse date availability) is regenerated from the GIBS
// capabilities on each release; a stale cached copy silently shows "no dates".
const NETWORK_ONLY = ['/layer-dates.json']

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
  const url = new URL(e.request.url)
  if (url.origin !== location.origin) return // skip external (tiles, OSM, GIBS)
  if (e.request.method !== 'GET') return
  if (NETWORK_ONLY.includes(url.pathname)) return // always fresh (timelapse dates)

  // Network-first for navigations so new builds (fresh index.html with new
  // hashed assets) are picked up automatically; fall back to the cached shell
  // when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // Stale-while-revalidate for app assets (JS/CSS/PNG/etc): serve from cache
  // instantly, refresh in the background. Hashed assets never go stale, and
  // everything the app needs is available offline after the first visit.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
