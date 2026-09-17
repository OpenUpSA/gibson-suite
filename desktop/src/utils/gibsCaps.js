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
//
// Sub-daily products (period < 1 day — IMERG precipitation, GOES/Himawari
// ABI, TEMPO) need a full `YYYY-MM-DDTHH:MI:SSZ` TIME to address an
// individual frame; everything else is happiest with a bare date. The raw
// values stored here keep their timestamps, and the helpers at the bottom of
// this file turn them into the frames of ONE day on demand (expanding every
// layer's full history up front would be hundreds of thousands of timestamps).

const CAPS_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml'
const WMTS_CGI = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi'
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

// ISO 8601 period (P1D, PT30M, PT10M, P8D) → seconds. A value with no period
// of its own (a single date) falls back to one day.
const parsePeriodToSeconds = (period) => {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(period || '')
  if (!m) return 86400
  const days = parseInt(m[1]) || 0
  const hours = parseInt(m[2]) || 0
  const mins = parseInt(m[3]) || 0
  const secs = parseFloat(m[4]) || 0
  const total = days * 86400 + hours * 3600 + mins * 60 + secs
  return total > 0 ? total : 86400
}

// ISO 8601 period → fractional days (day-resolution expansion only).
const parsePeriodToDays = (period) => parsePeriodToSeconds(period) / 86400

// Epoch ms for a bare date ('2026-09-15') or a full ISO datetime
// ('2026-09-15T19:40:00Z'). Bare dates mean 00:00:00Z. null when unparseable.
const valueToMs = (value) => {
  const s = String(value ?? '').trim()
  if (!s) return null
  const ms = Date.parse(s.includes('T') ? s : `${s}T00:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

// `'2026-09-17T01:30:00.000Z'`-style formatting (capitals, no milliseconds) —
// the shape GIBS echoes back and therefore the shape we compare/store.
const isoSeconds = (ms) => `${new Date(ms).toISOString().slice(0, 19)}Z`

// Today in UTC — the day whose newest frames the static data can be missing.
const utcToday = () => new Date().toISOString().split('T')[0]

// Upper bound in ms for a range query: a bare date covers its whole day, so an
// end of '2026-09-15' must not exclude that day's frames after midnight.
const boundEndMs = (value) => {
  const s = String(value ?? '').trim()
  const ms = valueToMs(s)
  if (ms === null) return null
  return s.includes('T') ? ms : ms + 86400000 - 1
}

// Day-granularity shift. Accepts a bare date OR a full ISO datetime, so a
// sub-daily time can never blow it up. (The old `${iso}T00:00:00Z`
// interpolation produced Invalid Date → `toISOString()` RangeError for
// datetimes.) Returns null for unparseable input.
const addDaysIso = (iso, days) => {
  const t = valueToMs(iso)
  if (t === null) return null
  return new Date(t + days * 86400000).toISOString().split('T')[0]
}

const diffDays = (a, b) => {
  const am = valueToMs(a)
  const bm = valueToMs(b)
  if (am === null || bm === null) return null
  return Math.round((bm - am) / 86400000)
}

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
      // Sub-daily periods (PT30M, PT1H, …) mean data exists at least once per
      // day, so iterate by whole days — correct AND keeps the loop small
      // (a PT30M interval would otherwise step 48×/day and blow the guard).
      const step = Math.max(1, parsePeriodToDays(parts[2]))
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

// Last available date (YYYY-MM-DD) for a layer — the same fast-path / live-caps
// fallback as getLayerTimeValues, but without expanding the whole date list.
// Returns null when the layer's availability is unknown.
//
// Used for the Add Layer "no data after …" warning: the static endDate stored in
// layers.json is only a snapshot taken when that file was generated, so it goes
// stale as GIBS keeps publishing (e.g. it still said 2026-08-04 weeks later).
export const getLayerLastDate = async (layerId) => {
  let jsonValues = null
  try {
    const byLayer = await ensureDates()
    jsonValues = byLayer[layerId]
  } catch {
    // JSON fetch failed — fall through to the live caps doc.
  }

  if (jsonValues && !isStale(jsonValues)) {
    return lastDateOf(jsonValues)
  }

  try {
    const doc = await ensureCapsDoc()
    const dim = findTimeDimension(doc, layerId)
    if (dim) {
      const values = [...dim.querySelectorAll('Value')].map((v) => v.textContent)
      return lastDateOf(values)
    }
  } catch (err) {
    console.warn('[gibsCaps] caps fallback failed, using static dates:', err)
  }

  return jsonValues ? lastDateOf(jsonValues) : null
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

// ── Sub-daily support ───────────────────────────────────────────────────
//
// "Subdaily" is GIBS' own term for a product whose period is under a day. For
// those, TIME must be a full datetime; a bare date resolves to the day's
// default frame — which is all the app used to send, so a sub-daily layer
// could never show anything but the same unchangeable image.

// Does this layer address individual frames? Config-driven (layers.json
// `subdaily: true`) — `metadata.temporalResolution` is display text and is
// deliberately not parsed.
export const isSubDailyLayer = (layer) => Boolean(layer && layer.subdaily)

const MAX_FRAMES_PER_DAY = 2000   // 10-min cadence is 144/day; 6-min is 240
const MAX_SCAN_STEPS = 200000     // safety net for very long runs

const runsCache = new Map()    // layerId → parsed runs
const domainCache = new Map()  // `${layerId}|${date}` → runs from DescribeDomains

// Raw TIME values → [{ startMs, endMs, stepSeconds }]. No expansion: a run
// spanning months stays one entry.
const parseRuns = (values) => {
  const runs = []
  for (const val of values || []) {
    const parts = String(val).split('/')
    if (parts.length >= 3) {
      const startMs = valueToMs(parts[0])
      const endMs = valueToMs(parts[1])
      if (startMs === null || endMs === null) continue
      runs.push({ startMs, endMs: Math.max(startMs, endMs), stepSeconds: parsePeriodToSeconds(parts[2]) })
    } else if (parts.length === 1 && parts[0]) {
      const ms = valueToMs(parts[0])
      if (ms !== null) runs.push({ startMs: ms, endMs: ms, stepSeconds: 86400 })
    }
  }
  return runs.sort((a, b) => a.startMs - b.startMs)
}

const loadRuns = async (layerId) => {
  if (runsCache.has(layerId)) return runsCache.get(layerId)
  let runs = []
  try {
    const byLayer = await ensureDates()
    runs = parseRuns(byLayer[layerId])
  } catch {
    // Static JSON unavailable — framesForDay falls back to DescribeDomains.
  }
  runsCache.set(layerId, runs)
  return runs
}

// Frames of one UTC day → sorted 'HH:MM' strings. Runs are clamped to the day
// and walked at their own cadence, so the result is exactly what GIBS has for
// that day (gaps included) rather than a synthetic grid.
const framesInDay = (runs, date) => {
  const dayStart = valueToMs(date)
  if (dayStart === null) return []
  const dayEnd = dayStart + 86400000
  const out = new Set()
  for (const run of runs) {
    const stepMs = Math.max(1, run.stepSeconds) * 1000
    if (run.endMs < dayStart || run.startMs >= dayEnd) continue
    const from = Math.max(run.startMs, dayStart)
    const to = Math.min(run.endMs, dayEnd - 1000)
    // Align to the run's own grid (frame times are not always on the hour).
    let t = run.startMs + Math.ceil((from - run.startMs) / stepMs) * stepMs
    let guard = 0
    while (t <= to && guard < MAX_FRAMES_PER_DAY) {
      out.add(new Date(t).toISOString().slice(11, 16))
      t += stepMs
      guard++
    }
  }
  return [...out].sort()
}

// Bounded DescribeDomains request — GIBS' fuller availability service. The
// capabilities document only lists the latest ~100 periods per layer, so days
// older than that (or gaps the runs merge over) are only visible here. Small:
// ~3 KB for a 3-day window of a 10-minute layer.
const fetchDomainRuns = async (layerId, date, tileMatrixSet) => {
  const key = `${layerId}|${date}`
  if (domainCache.has(key)) return domainCache.get(key)
  const tms = tileMatrixSet ? `&TILEMATRIXSET=${encodeURIComponent(tileMatrixSet)}` : ''
  const url = `${WMTS_CGI}?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0` +
    `&LAYER=${encodeURIComponent(layerId)}${tms}&TIME=${addDaysIso(date, -1)}/${addDaysIso(date, 1)}`
  let runs = []
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (res.ok) {
      const text = await res.text()
      const domain = /<Domain>([\s\S]*?)<\/Domain>/.exec(text)
      if (domain) runs = parseRuns(domain[1].split(','))
    }
  } catch (err) {
    console.warn('[gibsCaps] DescribeDomains failed:', err)
  }
  domainCache.set(key, runs)
  return runs
}

// Frame times of a UTC day → sorted 'HH:MM'. Empty when the layer has no
// sub-daily data for that day. `layer` may be an id or a layer object (the
// object supplies the tileMatrixSet for the DescribeDomains fallback).
export const framesForDay = async (layer, date) => {
  const layerId = typeof layer === 'string' ? layer : layer?.id
  if (!layerId) return []
  const runs = await loadRuns(layerId)
  const local = framesInDay(runs, date)
  // Only sub-daily layers have frames worth looking up per day. Everything
  // else has one frame a day and is answered by the static runs.
  const subDaily = isSubDailyLayer(layer) || runs.some(r => r.stepSeconds < 86400)
  if (!subDaily) return local
  // The static runs come from the capabilities document, which lists only the
  // latest ~100 periods per layer — and "the newest periods" is exactly what is
  // missing for TODAY. Ask the live availability service when the day is empty
  // or current, and merge so nothing the static data knows is lost.
  const needsLive = !local.length || date === utcToday()
  if (!needsLive) return local
  const remote = await fetchDomainRuns(layerId, date, typeof layer === 'object' ? layer.tileMatrixSet : null)
  const merged = new Set(local)
  for (const f of framesInDay(remote, date)) merged.add(f)
  return [...merged].sort()
}

// Newest value the layer has: a full ISO datetime for sub-daily products, a
// bare date for daily ones. null when unknown. Pass the layer object (not just
// its id) so a sub-daily layer can consult the live availability service — the
// capabilities snapshot can lag the newest frame by hours.
export const getLayerLatestTime = async (layer) => {
  const layerId = typeof layer === 'string' ? layer : layer?.id
  if (!layerId) return null
  const runs = await loadRuns(layerId)
  const subDaily = isSubDailyLayer(layer) || runs.some(r => r.stepSeconds < 86400)
  let latestMs = runs.length ? runs[runs.length - 1].endMs : null
  if (subDaily && latestMs !== null) {
    const date = new Date(latestMs).toISOString().split('T')[0]
    const remote = await fetchDomainRuns(layerId, date, typeof layer === 'object' ? layer.tileMatrixSet : null)
    for (const run of remote) if (run.endMs > latestMs) latestMs = run.endMs
  }
  if (latestMs === null) return null
  return subDaily ? isoSeconds(latestMs) : new Date(latestMs).toISOString().split('T')[0]
}

// Availability between two date/datetime bounds, sampled at least
// `intervalMinutes` apart — the sub-daily counterpart of availableDates, and
// what the timelapse fetch uses for every layer. Values come back in the
// layer's own granularity (bare dates for daily layers, ISO datetimes for
// sub-daily ones), so they can be handed straight to a WMS TIME parameter.
export const availableTimes = async (layerId, start, end, intervalMinutes = 1440, maxResults = 2000) => {
  const runs = await loadRuns(layerId)
  const startMs = valueToMs(start)
  // A bare end date means the whole of that day, not its midnight.
  const endMs = boundEndMs(end)
  if (startMs === null || endMs === null || !runs.length) return []
  const wantMs = Math.max(0, intervalMinutes) * 60000
  const out = []
  let lastPickedMs = null
  for (const run of runs) {
    if (run.endMs < startMs) continue
    if (run.startMs > endMs) break
    const stepMs = Math.max(1, run.stepSeconds) * 1000
    const from = Math.max(run.startMs, startMs)
    const to = Math.min(run.endMs, endMs)
    let t = run.startMs + Math.ceil((from - run.startMs) / stepMs) * stepMs
    let guard = 0
    while (t <= to && guard < MAX_SCAN_STEPS) {
      // "First value in each window" — same rule as the daily picker, so a
      // data gap never shifts the sampling grid.
      if (lastPickedMs === null || t - lastPickedMs >= wantMs) {
        out.push(run.stepSeconds >= 86400 ? new Date(t).toISOString().split('T')[0] : isoSeconds(t))
        lastPickedMs = t
        if (out.length >= maxResults) {
          console.warn(`[gibsCaps] availableTimes hit the ${maxResults}-frame cap for ${layerId} — narrow the range or use a coarser interval`)
          return out
        }
      }
      t += stepMs
      guard++
    }
  }
  return out
}
