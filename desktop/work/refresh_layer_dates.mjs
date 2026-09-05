#!/usr/bin/env node
// Build-time refresh of public/layer-dates.json (timelapse date availability).
//
// Runs automatically as the `prebuild` hook (before `vite build`), so every
// deploy ships fresh dates — no manual regeneration needed. It:
//
//   1. Reads the committed public/layer-dates.json and checks the last date of
//      a sentinel daily layer (VIIRS NOAA-21 True Color).
//   2. If that date is older than STALE_DAYS (or the file is missing), it
//      downloads the current GIBS WMTS capabilities and regenerates the JSON
//      via work/gen_layer_dates.py.
//   3. On ANY failure (GIBS down, no python3, timeout) it warns and keeps the
//      committed JSON — the build never breaks because of a refresh.
//
// The committed JSON is the fallback; the regenerated one is what gets served.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CAPS_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml'
const CAPS_FILE = path.join(ROOT, 'work', 'wmts_caps.xml')
const OUT_FILE = path.join(ROOT, 'public', 'layer-dates.json')
const SENTINEL = 'VIIRS_NOAA21_CorrectedReflectance_TrueColor' // daily, always current
const STALE_DAYS = 1
const DOWNLOAD_TIMEOUT_MS = 60_000

// Last date (YYYY-MM-DD) covered by a layer's raw TIME values.
const lastDateOf = (values) => {
  let last = null
  for (const v of values) {
    const end = (v.split('/')[1] || v.split('/')[0]).split('T')[0]
    if (!last || end > last) last = end
  }
  return last
}

const needsRefresh = () => {
  if (!existsSync(OUT_FILE)) return true
  try {
    const data = JSON.parse(readFileSync(OUT_FILE, 'utf8'))
    const last = lastDateOf(data[SENTINEL] || [])
    if (!last) return true
    const days = (Date.now() - Date.parse(`${last}T00:00:00Z`)) / 86_400_000
    return days > STALE_DAYS
  } catch {
    return true
  }
}

const download = async (url, dest) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  const text = await res.text()
  mkdirSync(path.dirname(dest), { recursive: true })
  writeFileSync(dest, text)
}

const main = async () => {
  if (!needsRefresh()) {
    console.log('[layer-dates] up to date, skipping refresh')
    return
  }
  console.log('[layer-dates] stale — refreshing from GIBS capabilities…')
  try {
    await download(CAPS_URL, CAPS_FILE)
    execFileSync('python3', ['work/gen_layer_dates.py'], { cwd: ROOT, stdio: 'inherit' })
    console.log('[layer-dates] refreshed')
  } catch (err) {
    console.warn(`[layer-dates] refresh failed (${err.message}) — keeping committed layer-dates.json`)
  }
}

main()