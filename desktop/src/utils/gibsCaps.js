// GIBS layer TIME availability — compact static JSON (public/layer-dates.json).
//
// The full WMTS capabilities XML is huge (5+ MB minified) and times out when
// proxied through Netlify (504 Gateway Timeout), which broke the timelapse
// "Fetch available dates" on the deployed site. Instead we ship a pre-generated
// static JSON with the raw TIME dimension values per layer (see
// work/gen_layer_dates.py) and expand the intervals client-side here. Static
// files are served straight from the CDN — no proxy, no timeout.
//
// The JSON is fetched once per session and cached at module level.

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

// Full sorted list of unique dates a layer has imagery for (from layer-dates.json).
export const getLayerTimeValues = async (layerId) => {
  const byLayer = await ensureDates()
  const values = byLayer[layerId]
  if (!values) return []

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
