// Lightweight "does this date have imagery in this area?" check for the
// timelapse preview browser.
//
// GIBS WMS returns a solid-black 16×16 PNG (~80 bytes) for a TIME with no
// data, and real imagery otherwise. So instead of downloading a full preview
// for every date, we first fetch this tiny probe and only download the real
// preview when it contains any non-black pixel. This keeps the browser panel
// light: zero images load until the user confirms, and empty dates are
// skipped entirely.
//
// Verified against gibs.earthdata.nasa.gov (2026-08): GET returns
// `content-type: image/png` + `access-control-allow-origin: *`, so the canvas
// pixel read is not tainted.

export const PROBE_W = 16
export const PROBE_H = 16
export const PREVIEW_CONCURRENCY = 4

const buildProbeUrl = (wmsBaseUrl, layer, bbox3857, time) => {
  const [minX, minY, maxX, maxY] = bbox3857
  return `${wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer.id}` +
    `&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=TRUE&CRS=EPSG:3857` +
    `&WIDTH=${PROBE_W}&HEIGHT=${PROBE_H}&BBOX=${minX},${minY},${maxX},${maxY}&TIME=${time}`
}

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // required to read pixels without tainting the canvas
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`probe failed: ${url}`))
    img.src = url
  })

// Resolves true when the WMS response contains any pixel brighter than a
// pure-black no-data signature (i.e. real imagery for this date + bbox).
export const probeHasData = async (wmsBaseUrl, layer, bbox3857, time) => {
  const img = await loadImage(buildProbeUrl(wmsBaseUrl, layer, bbox3857, time))
  const canvas = document.createElement('canvas')
  canvas.width = PROBE_W
  canvas.height = PROBE_H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, PROBE_W, PROBE_H)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 2 || data[i + 1] > 2 || data[i + 2] > 2) return true
  }
  return false
}

// Run `worker(item)` over every item with at most `concurrency` in flight.
// A failing worker does not abort the batch — errors are left for the caller
// to handle per item.
export const runPool = async (items, worker, concurrency = PREVIEW_CONCURRENCY) => {
  const queue = [...items]
  if (!queue.length) return
  const active = Math.min(concurrency, queue.length)
  await Promise.all(
    Array.from({ length: active }, async () => {
      while (queue.length) {
        const item = queue.shift()
        try {
          await worker(item)
        } catch {
          // per-item errors are handled by the worker itself; ignore here
        }
      }
    })
  )
}
