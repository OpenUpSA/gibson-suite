// Time-of-day helpers for sub-daily GIBS layers (precipitation, GOES, …).
//
// GIBS accepts either a plain `YYYY-MM-DD` (implied 00:00:00Z, then snapped to
// the nearest frame) or a full `YYYY-MM-DDTHH:MI:SSZ`. Only the full form can
// address an individual frame of a "subdaily" product (period < 1 day), so
// every tile URL for those layers carries a time-of-day.
//
// Everything here is UTC and deliberately so: GIBS times are UTC, and an image
// caption that says "09:40" must not silently mean a different instant in a
// different timezone. The UI shows `09:40Z` / `09:40 UTC` for that reason.
//
// Pure string/number helpers only — no React, no DOM — so they can be unit
// tested with plain node (see work/verify_subdaily.mjs).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const MINUTES_PER_DAY = 1440

// `'2026-09-15T19:40:00Z' | '2026-09-15'` → `'2026-09-15'`
export const datePart = (value) => String(value ?? '').split('T')[0]

// `'2026-09-15T19:40:00Z'` → `'19:40'`; date-only (or empty) → null.
export const timePart = (value) => {
  const t = String(value ?? '').split('T')[1]
  return t ? t.slice(0, 5) : null
}

// Strict `HH:MM` (24h, zero-padded) test.
export const isValidHHMM = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ''))

// Loose input → canonical `'HH:MM'`: accepts `19:40`, `9:40`, `1940`, `19.40`.
// Returns null when the value isn't a real time.
export const normalizeHHMM = (value) => {
  const raw = String(value ?? '').trim()
  const m = /^(\d{1,2})[:.\s]?(\d{2})$/.exec(raw)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''))
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export const fromMinutes = (minutes) => {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

// `(date, 'HH:MM')` → `'YYYY-MM-DDTHH:MM:00Z'` — the WMTS/WMS TIME value for a
// sub-daily frame. A null time returns the bare date (GIBS then serves that
// day's default frame).
export const joinDateTime = (date, hhmm) => {
  const d = datePart(date)
  if (!hhmm) return d
  return `${d}T${hhmm}:00Z`
}

// Parse a date or full ISO datetime (as used anywhere in the app) to epoch ms
// in UTC. `'2026-09-15'` means 00:00:00Z. Returns null when unparseable.
export const parseDateTimeMs = (value) => {
  const s = String(value ?? '').trim()
  if (!s) return null
  const ms = Date.parse(s.includes('T') ? s : `${s}T00:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

// Shift a date + `HH:MM` by whole minutes, rolling the date over midnight.
// → `{ date, hhmm }`. This is what the time stepper buttons and the timelapse
// interval sampler use, so a "+30 min" on 23:50 lands on 00:20 the next day.
export const addMinutes = (date, hhmm, minutes) => {
  const base = parseDateTimeMs(joinDateTime(date, hhmm))
  if (base === null) return { date: datePart(date), hhmm: null }
  const next = new Date(base + minutes * 60_000)
  return { date: next.toISOString().split('T')[0], hhmm: next.toISOString().slice(11, 16) }
}

// Whole-minute difference between two date(+time) values, `b - a`.
export const diffMinutes = (a, b) => {
  const am = parseDateTimeMs(a)
  const bm = parseDateTimeMs(b)
  if (am === null || bm === null) return null
  return Math.round((bm - am) / 60_000)
}

// Sortable epoch ms for any value shape used in the app: a full ISO datetime,
// a bare date (00:00Z) or a bare `HH:MM` (minutes past UTC midnight). Returns
// null for anything unparseable. Comparing a mixed list therefore still means
// "chronologically within the same day" for time-only values.
export const comparableMs = (value) => {
  const s = String(value ?? '').trim()
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const m = toMinutes(s)
    return m === null ? null : m * 60_000
  }
  return parseDateTimeMs(s)
}

// Nearest value in an ascending list (frames of a day, dates, …). Returns null
// for an empty list; ties resolve to the earlier value.
export const nearestValue = (values, target) => {
  const t = comparableMs(target)
  if (!Array.isArray(values) || !values.length || t === null) return null
  let best = values[0]
  let bestDelta = Math.abs(comparableMs(best) - t)
  for (const v of values) {
    const delta = Math.abs(comparableMs(v) - t)
    if (delta < bestDelta) {
      best = v
      bestDelta = delta
    }
  }
  return best
}

// `'2026-09-15'` → `'15 Sep 2026'`; with a time → `'15 Sep 2026, 19:40 UTC'`.
export const formatDateTimeLabel = (value) => {
  const d = datePart(value)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) return String(value ?? '')
  const base = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
  const t = timePart(value)
  return t ? `${base}, ${t} UTC` : base
}

// Compact form for tight UI (frame rows, timeline chips): `'19:40Z'`, or `''`
// for date-only values.
export const formatTimeShort = (value) => {
  const t = timePart(value)
  return t ? `${t}Z` : ''
}

// Date with time appended only when present — the label used by timelapse
// frame rows and GIF date stamps, where both daily and sub-daily frames mix.
export const formatFrameLabel = (value) => {
  const t = timePart(value)
  return t ? `${datePart(value)} ${t}` : datePart(value)
}

// Filename-safe stamp: `'2026-09-15'` → `'2026-09-15'`,
// `'2026-09-15T19:40:00Z'` → `'2026-09-15_1940'` (no `:` or `T`, which are
// illegal/lossy in download filenames on some platforms).
export const safeFilenameStamp = (value) => {
  const d = datePart(value)
  const t = timePart(value)
  return t ? `${d}_${t.replace(':', '')}` : d
}
