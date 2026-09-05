// GIBS layer TIME availability — compact static JSON (public/layer-dates.json).
//
// The full WMTS capabilities XML is huge (5+ MB minified) and times out when
// proxied through Netlify (504 Gateway Timeout), which broke the timelapse
// "Fetch available dates" on the deployed site. Instead we ship a pre-generated
// static JSON with the raw TIME dimension values per layer (see
// work/gen_layer_dates.py) and expand the intervals client-side here. Static
// files are served straight from the CDN — no proxy, no timeout.
//
// The JSON is refreshed automatically at build time (work/refresh_layer_dates.mjs),
// but as a safety net the code below falls back to fetching the live caps XML
// DIRECTLY from GIBS (CORS-enabled) when the JSON is stale or missing a layer —
// so new layers / recent dates still work between deploys.
//
// Both sources are fetched once per session and cached at module level.

const CAPS_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml'
const STALE_DAYS = 3 // JSON older than this (for a queried layer) → use live caps

let datesPromise = null
let datesByLayer = null

const ensureDates = async () => {
  if (datesByLayer) return datesByLayer
  if (!datesPromise) {
    datesPromise = fetch('/layer-dates.json')
      .then((res) => {
        if (!res.ok) throw new Error(`layer dates fetch failed: ${res.status}`)
        return res.json()
      })
      .then((data) => {
        datesByLayer = data
        return datesByLayer
      })
  }
  return datesPromise
}

// ── Live caps fallback (direct GIBS fetch, CORS-enabled) ────────────────
let capsPromise = null
let capsDoc = null

// Strip namespace prefixes so querySelector can match by local name. The GIBS
// caps declares a default namespace (xmlns='...wmts/1.0'); after renaming
// <ows:Identifier> -> <Identifier> the elements still carry that namespace, so
// querySelector('Layer') would match nothing. Stripping the default xmlns puts
// them in the null namespace. Prefixed declarations (xmlns:xlink, ...) are kept
// so attributes like xlink:href stay valid.
const stripNamespaces = (text) => text
  .replace(/<\/(\w+):(\w+)>/g, '</$2>')
  .replace(/<(\w+):(\w+)([\s>])/g, '<$2$3')
  .replace(/\s+xmlns=(?:"[^"]*"|'[^']*')/g, '')

const ensureCapsDoc = async () => {
  if (capsDoc) return capsDoc
  if (!capsPromise) {
    capsPromise = fetch(CAPS_URL, { signal: AbortSignal.timeout(30000) })
      .then((res) => {
        if (!res.ok) throw new Error(`capabilities fetch failed: ${res.status}`)
        return res.text()
      })
      .then((text) => {
        capsDoc = new DOMParser().parseFromString(stripNamespaces(text), 'text/xml')
        return capsDoc
      })
      .catch((err) => {
        capsPromise = null // allow a retry on the next call
        throw err
      })
  }
  return capsPromise
}

const findTimeDimension = (doc, layerId) => {
  for (const el of doc.querySelectorAll('Layer')) {
    const idEl = el.querySelector('Identifier')
    if (idEl && idEl.textContent === layerId) {
      for (const dim of el.querySelectorAll('Dimension')) {
        const dimId = dim.querySelector('Identifier')
        if (dimId && dimId.textContent.toLowerCase() === 'time') return dim
      }
    }
  }
  return null
}

// ISO 8601 period (P1D, PT30M, P8D) → fractional days.
const parsePeriodToDays = (period) => {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(period || '')
  if (!m) return 1
  const days = parseInt(m[1]) || 0
  const hours = parseInt(m[2]) || 0
  const mins = parseInt(m[3]) || 0
  const secs = parseFloat(m[4]) || 0
  const totalDays = days + hours / 24 + mins / (24 * 60) + secs / (24 * 60 * 60)
  return totalDays || 1
}

const addDaysIso = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

const diffDays = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000)

// Raw TIME values ("start/end/period" intervals + single dates) → sorted
// unique YYYY-MM-DD list.
const expandValues = (values) => {
  const dates = []
  for (const val of values) {
    const parts = val.split('/')
    if (parts.length >= 3) {
      // Interval: start/end/period
      const start = parts[0].split('T')[0]
      const end = parts[1].split('T')[0]
      const step = parsePeriodToDays(parts[2])
      let cur = start
      let guard = 0
      while (cur <= end && guard < 100000) {
        dates.push(cur)
        cur = addDaysIso(cur, step)
        guard++
      }
    } else if (parts.length === 1 && parts[0]) {
      // Single date
      dates.push(parts[0].split('T')[0])
    }
  }
  return [...new Set(dates)].sort()
}

// Last date (YYYY-MM-DD) covered by a layer's raw TIME values.
const lastDateOf = (values) => {
  let last = null
  for (const v of values) {
    const end = (v.split('/')[1] || v.split('/')[0]).split('T')[0]
    if (!last || end > last) last = end
  }
  return last
}

// True when the JSON's data for a layer is older than STALE_DAYS.
const isStale = (values) => {
  const last = lastDateOf(values)
  if (!last) return true
  return (Date.now() - Date.parse(`${last}T00:00:00Z`)) / 86400000 > STALE_DAYS
}

// Full sorted list of unique dates a layer has imagery for.
//
// Fast path: the static JSON. Fallbacks (in order): live caps doc when the
// layer is missing or stale; then the JSON again as a last resort (stale data
// beats no data).
export const getLayerTimeValues = async (layerId) => {
  let jsonValues = null
  try {
    const byLayer = await ensureDates()
    jsonValues = byLayer[layerId]
  } catch {
    // JSON fetch failed — fall through to the live caps doc.
  }

  if (jsonValues && !isStale(jsonValues)) {
    return expandValues(jsonValues)
  }

  try {
    const doc = await ensureCapsDoc()
    const dim = findTimeDimension(doc, layerId)
    if (dim) {
      const values = [...dim.querySelectorAll('Value')].map((v) => v.textContent)
      return expandValues(values)
    }
  } catch (err) {
    console.warn('[Timelapse] caps fallback failed, using static dates:', err)
  }

  return jsonValues ? expandValues(jsonValues) : []
}

// Dates in [start, end] (inclusive), sub-sampled by intervalDays (1/3/7/30).
// intervalDays 1 returns every available date; larger intervals pick the first
// available date in each window of that many days.
export const availableDates = async (layerId, start, end, intervalDays = 1) => {
  const all = await getLayerTimeValues(layerId)
  const interval = Math.max(1, Math.round(intervalDays) || 1)
  const result = []
  let lastPicked = null
  for (const d of all) {
    if (d < start) continue
    if (d > end) break
    if (!lastPicked || diffDays(lastPicked, d) >= interval) {
      result.push(d)
      lastPicked = d
    }
  }
  return result
}
