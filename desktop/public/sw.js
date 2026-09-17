const CACHE = 'gibson-v7'
const TILE_CACHE = 'gibson-tiles-v1'
const PRECACHE = ['/', '/index.html']
// Data files that change with every deploy — never cache, always fetch fresh.
// layer-dates.json (timelapse date availability) is regenerated from the GIBS
// capabilities on each release; a stale cached copy silently shows "no dates".
const NETWORK_ONLY = ['/layer-dates.json']

// ── GIBS tile cache ───────────────────────────────────────────────────
// The single biggest speed lever in the app. GIBS answers every WMS tile with
// `cache-control: max-age=0, no-store, no-cache`, so the browser throws each
// one away the moment it has been used — panning back, switching views,
// changing the date or the resolution all pay full CDN round trips again
// (~1s each). We keep our own copy instead.
//
// Only WMS is cached: the WMTS pyramid (base + reference overlays) is already
// served with `max-age=259200`, so the browser handles those itself.
const TILE_HOST = 'gibs.earthdata.nasa.gov'
const TILE_MIN_BYTES = 2048
// GIBS answers a date it has no imagery for with a 200 and a ~700 byte blank
// tile — and it backfills those dates as the imagery is processed, so caching
// one would leave a permanent hole. Anything that small is left uncached.
const TILE_MAX_ENTRIES = 3000
const TRIM_EVERY = 250

let putsSinceTrim = 0

// Map tiles only. The timelapse browser and the GIF exporter hit the same
// endpoint for full-size stills; those are one-shot, far larger and would
// otherwise dominate a cache whose job is to hold the tiles you pan back over.
const isTileRequest = (url) =>
  url.hostname === TILE_HOST &&
  url.pathname.includes('/wms/') &&
  (url.search.includes('WIDTH=512&HEIGHT=512') || url.search.includes('WIDTH=256&HEIGHT=256'))

// Drop the oldest entries once the cache grows past its cap. Insertion order is
// preserved by the Cache API, and each stored response carries the time it was
// written (see cacheTile), so trimming is a stable "oldest first" walk.
const trimTiles = async (cache) => {
  const keys = await cache.keys()
  if (keys.length <= TILE_MAX_ENTRIES) return
  const entries = await Promise.all(keys.map(async (request) => {
    const res = await cache.match(request)
    const at = Number(res?.headers.get('x-gibson-cached-at') || 0)
    return { request, at }
  }))
  entries.sort((a, b) => a.at - b.at)
  const excess = entries.length - TILE_MAX_ENTRIES
  for (let i = 0; i < excess; i++) await cache.delete(entries[i].request)
}

const cacheTile = async (request, response) => {
  try {
    // Read the body once so we can both store it and measure it. `content-length`
    // is CORS-safelisted, but a proxy can omit it — measuring the buffer covers
    // both, and the size check is what keeps blank "no imagery" tiles out.
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength < TILE_MIN_BYTES) return
    const headers = new Headers(response.headers)
    headers.set('x-gibson-cached-at', String(Date.now()))
    // A rebuilt response must keep the CORS header: the page fetches tiles
    // cross-origin, and a synthesized response without it is rejected.
    const cache = await caches.open(TILE_CACHE)
    await cache.put(request, new Response(buffer, {
      status: response.status,
      statusText: response.statusText,
      headers
    }))
    if (++putsSinceTrim >= TRIM_EVERY) {
      putsSinceTrim = 0
      await trimTiles(cache)
    }
  } catch {
    // Caching is best-effort — a failure here must never break the tile itself.
  }
}

const handleTile = async (request, event) => {
  const cache = await caches.open(TILE_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) event.waitUntil(cacheTile(request, response.clone()))
    return response
  } catch (err) {
    // Offline (or a dead network) — hand back a blank tile rather than an error
    // so the map keeps its other layers instead of reporting a failure.
    return new Response('', { status: 504, statusText: 'Offline' })
  }
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      // Keep the tile cache across releases — it holds imagery, not app code,
      // so clearing it would mean re-downloading everything for no reason.
      Promise.all(
        keys.filter(k => k !== CACHE && k !== TILE_CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return

  if (isTileRequest(url)) {
    e.respondWith(handleTile(e.request, e))
    return
  }

  if (url.origin !== location.origin) return // other external hosts are left alone
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
