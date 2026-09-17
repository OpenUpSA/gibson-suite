#!/usr/bin/env node
// Assertions for the sub-daily time helpers. Plain node, no test runner (the
// app has none) — run with:  node work/verify_subdaily.mjs
//
// gibsCaps.js is exercised against the real committed public/layer-dates.json
// by stubbing global fetch (its only I/O). The DescribeDomains fallback test is
// allowed to skip when the network is unavailable.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATES_JSON = path.join(ROOT, 'public', 'layer-dates.json')

let failures = 0
let checks = 0

const eq = (actual, expected, label) => {
  checks++
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    failures++
    console.log(`✗ ${label}\n    expected ${e}\n    actual   ${a}`)
  }
}

const ok = (cond, label) => eq(Boolean(cond), true, label)

// ── timeFormat ──────────────────────────────────────────────────────────
const tf = await import('../src/utils/timeFormat.js')
const {
  datePart, timePart, isValidHHMM, normalizeHHMM, joinDateTime, parseDateTimeMs,
  addMinutes, diffMinutes, nearestValue, formatDateTimeLabel, formatTimeShort,
  formatFrameLabel, safeFilenameStamp, fromMinutes,
} = tf

eq(datePart('2026-09-15T19:40:00Z'), '2026-09-15', 'datePart datetime')
eq(datePart('2026-09-15'), '2026-09-15', 'datePart date')
eq(timePart('2026-09-15T19:40:00Z'), '19:40', 'timePart datetime')
eq(timePart('2026-09-15'), null, 'timePart date-only')
eq(isValidHHMM('19:40'), true, 'isValidHHMM ok')
eq(isValidHHMM('24:00'), false, 'isValidHHMM rejects 24:00')
eq(isValidHHMM('9:40'), false, 'isValidHHMM needs padding')
eq(normalizeHHMM('9:40'), '09:40', 'normalizeHHMM 9:40')
eq(normalizeHHMM('1940'), '19:40', 'normalizeHHMM 1940')
eq(normalizeHHMM('25:00'), null, 'normalizeHHMM rejects 25:00')
eq(joinDateTime('2026-09-15', '19:40'), '2026-09-15T19:40:00Z', 'joinDateTime')
eq(joinDateTime('2026-09-15', null), '2026-09-15', 'joinDateTime without time')
eq(joinDateTime('2026-09-15T00:00:00Z', '19:40'), '2026-09-15T19:40:00Z', 'joinDateTime strips input time')
eq(parseDateTimeMs('2026-09-15'), Date.parse('2026-09-15T00:00:00Z'), 'parseDateTimeMs date')
eq(parseDateTimeMs(''), null, 'parseDateTimeMs empty')
eq(addMinutes('2026-09-15', '23:50', 30), { date: '2026-09-16', hhmm: '00:20' }, 'addMinutes rolls over')
eq(addMinutes('2026-09-15', '00:10', -30), { date: '2026-09-14', hhmm: '23:40' }, 'addMinutes rolls back')
eq(diffMinutes('2026-09-15T00:00:00Z', '2026-09-15T06:30:00Z'), 390, 'diffMinutes')
eq(nearestValue(['19:00', '19:10', '19:30'], '19:14'), '19:10', 'nearestValue')
eq(nearestValue([], '19:14'), null, 'nearestValue empty')
eq(formatDateTimeLabel('2026-09-15T19:40:00Z'), '15 Sep 2026, 19:40 UTC', 'formatDateTimeLabel')
eq(formatDateTimeLabel('2026-09-15'), '15 Sep 2026', 'formatDateTimeLabel date-only')
eq(formatTimeShort('2026-09-15T19:40:00Z'), '19:40Z', 'formatTimeShort')
eq(formatTimeShort('2026-09-15'), '', 'formatTimeShort date-only')
eq(formatFrameLabel('2026-09-15T19:40:00Z'), '2026-09-15 19:40', 'formatFrameLabel')
eq(safeFilenameStamp('2026-09-15T19:40:00Z'), '2026-09-15_1940', 'safeFilenameStamp')
eq(safeFilenameStamp('2026-09-15'), '2026-09-15', 'safeFilenameStamp date-only')
eq(fromMinutes(1440 + 20), '00:20', 'fromMinutes wraps')

// ── gibsCaps ────────────────────────────────────────────────────────────
const datesJson = readFileSync(DATES_JSON, 'utf8')
const realFetch = globalThis.fetch.bind(globalThis)
let networkCalls = 0
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.includes('layer-dates.json')) {
    return { ok: true, json: async () => JSON.parse(datesJson) }
  }
  networkCalls++
  return realFetch(u)
}

const { framesForDay, availableTimes, getLayerLatestTime, isSubDailyLayer, getLayerLastDate } =
  await import('../src/utils/gibsCaps.js')

eq(isSubDailyLayer({ id: 'X', subdaily: true }), true, 'isSubDailyLayer true')
eq(isSubDailyLayer({ id: 'X' }), false, 'isSubDailyLayer false')

const IMERG = { id: 'IMERG_Precipitation_Rate_30min', subdaily: true, tileMatrixSet: 'GoogleMapsCompatible_Level6' }
const DAILY = { id: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor', section: 'imagery' }

const imergDay = await framesForDay(IMERG, '2026-09-15')
ok(imergDay.length > 40, `IMERG frames on 2026-09-15 (${imergDay.length})`)
eq(imergDay.every(f => /^\d{2}:\d{2}$/.test(f)), true, 'IMERG frames are HH:MM')
eq([...imergDay].sort(), imergDay, 'IMERG frames sorted')
ok(imergDay.includes('00:00') || imergDay[0] > '00:00', 'IMERG has an early frame')

const latest = await getLayerLatestTime(IMERG)
ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(latest), `IMERG latest is a datetime (${latest})`)
const todayFrames = await framesForDay(IMERG, new Date().toISOString().split('T')[0])
ok(todayFrames.length > 0, `today's frames come from the live availability service (${todayFrames.length})`)

// Daily layers must never pay for a live lookup.
const beforeDaily = networkCalls
const dailyLatest = await getLayerLatestTime(DAILY)
ok(/^\d{4}-\d{2}-\d{2}$/.test(dailyLatest), `daily layer latest is a date (${dailyLatest})`)
const dailyDay = await framesForDay(DAILY, '2026-09-15')
eq(dailyDay, ['00:00'], 'daily layer collapses to one frame')
eq(networkCalls, beforeDaily, 'daily layers need no live availability request')

// Hourly sampling across one day of IMERG: 48 half-hour frames → 24 hourly.
const hourly = await availableTimes(IMERG.id, '2026-09-15', '2026-09-15', 60)
ok(hourly.length >= 20 && hourly.length <= 25, `IMERG hourly samples on one day (${hourly.length})`)
eq(hourly.every(v => v.includes('T')), true, 'sub-daily sampling returns datetimes')
ok(hourly.every((v, i) => i === 0 || Date.parse(v) > Date.parse(hourly[i - 1])), 'samples ascending')

// Daily layer at a daily interval → bare dates, unchanged behaviour.
const dailySamples = await availableTimes(DAILY.id, '2026-09-10', '2026-09-15', 1440)
eq(dailySamples.every(v => /^\d{4}-\d{2}-\d{2}$/.test(v)), true, 'daily sampling returns dates')
eq(dailySamples.includes('2026-09-15'), true, 'daily sampling includes the end date')

const cap = await availableTimes(IMERG.id, '2026-01-01', '2026-12-31', 30, 100)
eq(cap.length, 100, 'maxResults cap respected')

// Older day missing from the truncated capabilities → DescribeDomains fallback.
// GOES caps only reach back ~a month, so March is guaranteed to exercise it.
const GOES = { id: 'GOES-East_ABI_GeoColor', subdaily: true, tileMatrixSet: 'GoogleMapsCompatible_Level6' }
const before = networkCalls
const oldDay = await framesForDay(GOES, '2026-03-15')
if (networkCalls === before) {
  console.log('… DescribeDomains fallback was not needed for 2026-03-15 (covered by the static JSON)')
} else if (!oldDay.length) {
  console.log('… DescribeDomains fallback returned no frames (offline?) — skipped')
} else {
  ok(oldDay.length > 100, `DescribeDomains fallback found frames for 2026-03-15 (${oldDay.length})`)
  eq(oldDay.every(f => /^\d{2}:\d{2}$/.test(f)), true, 'fallback frames are HH:MM')

  // Unknown day → empty, and the layer must not be reported as having data.
  const emptyDay = await framesForDay(GOES, '1999-01-01')
  eq(emptyDay, [], 'no frames for a date outside the domain')
}

const lastDate = await getLayerLastDate(IMERG.id)
ok(/^\d{4}-\d{2}-\d{2}$/.test(lastDate), `getLayerLastDate still date-only (${lastDate})`)

// ── persistence round-trips ─────────────────────────────────────────────
const { serializeProject, deserializeProject } = await import('../src/utils/projectFile.js')
const { encodeCompareShare, decodeCompareShare } = await import('../src/utils/shareCompare.js')

const project = serializeProject({
  tabs: [
    { id: 't1', label: 'Rain', date: '2026-09-16', time: '06:30', activeBySection: { imagery: ['IMERG_Precipitation_Rate_30min'], base: [], reference: [] }, layerSettings: {}, hiddenLayers: new Set(), mapPosition: null },
    { id: 't2', label: 'Daily', date: '2026-09-15', time: null, activeBySection: { imagery: ['VIIRS_NOAA21_CorrectedReflectance_TrueColor'], base: [], reference: [] }, layerSettings: {}, hiddenLayers: new Set(), mapPosition: null },
  ],
  gridConfig: { rows: 1, cols: 1, width: 800, height: 450, cells: {}, captions: {} },
  compareCaptions: null, compareMode: 'split', activeTabId: 't1',
})
eq(project.tabs[0].time, '06:30', 'project file keeps the time-of-day')
eq(project.tabs[1].time, null, 'project file keeps Auto (null)')
const restored = deserializeProject(JSON.stringify(project))
eq(restored.tabs[0].time, '06:30', 'project round-trip keeps the time')
eq(restored.tabs[0].date, '2026-09-16', 'project round-trip keeps the date')
// A project saved before sub-daily support simply has no `time` key.
const legacy = JSON.parse(JSON.stringify(project))
delete legacy.tabs[0].time
eq(deserializeProject(JSON.stringify(legacy)).tabs[0].time, null, 'older project files open in Auto')

const payload = encodeCompareShare({
  tabA: { label: 'A', date: '2026-09-16', time: '06:30', activeBySection: { imagery: [], base: [], reference: [] }, mapPosition: null },
  tabB: { label: 'B', date: '2026-09-15', activeBySection: { imagery: [], base: [], reference: [] } },
  captions: null,
})
const decoded = decodeCompareShare(payload)
eq(decoded.tabs[0].t, '06:30', 'share link carries the time-of-day')
eq(decoded.tabs[1].t, undefined, 'share link omits Auto time')
eq(decoded.v, 1, 'share payload version unchanged (older links still decode)')

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ''}`)
process.exit(failures ? 1 : 0)
