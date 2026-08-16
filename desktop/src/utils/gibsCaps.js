// GIBS WMTS capabilities parser — extracts the available TIME values for a
// layer so the timelapse tool knows which dates have imagery.
//
// The caps XML is large (tens of MB), so it is fetched once per session and
// cached at module level. The vite dev server proxies /wmts-capabilities to
// https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0 (see vite.config.js).

let capsPromise = null
let capsDoc = null

// Strip namespace prefixes so querySelector can match by local name
// (same trick as the legacy app).
const stripNamespaces = (text) => text
  .replace(/<\/(\w+):(\w+)>/g, '</$2>')
  .replace(/<(\w+):(\w+)([\s>])/g, '<$2$3')
  .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '')

const ensureCaps = async () => {
  if (capsDoc) return capsDoc
  if (!capsPromise) {
    capsPromise = fetch('/wmts-capabilities/WMTSCapabilities.xml')
      .then((res) => {
        if (!res.ok) throw new Error(`capabilities fetch failed: ${res.status}`)
        return res.text()
      })
      .then((text) => {
        const clean = stripNamespaces(text)
        capsDoc = new DOMParser().parseFromString(clean, 'text/xml')
        return capsDoc
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

// Full sorted list of unique dates a layer has imagery for (from capabilities).
export const getLayerTimeValues = async (layerId) => {
  const doc = await ensureCaps()
  const dim = findTimeDimension(doc, layerId)
  if (!dim) return []

  const dates = []
  for (const val of dim.querySelectorAll('Value')) {
    const parts = val.textContent.split('/')
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
