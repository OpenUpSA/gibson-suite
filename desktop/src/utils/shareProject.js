// URL share helpers for the grid layout — "composition" sharing.
//
// The share link carries the *composition*: grid dimensions, cell
// assignments, and per-view label / date / active layers / map position,
// all keyed by layer IDs that the catalog resolves on load. Per-layer
// quality/opacity and caption text are deliberately left out — when a
// setup needs those, it belongs in a project file (see projectFile.js).

import { b64urlEncode, b64urlDecode } from './base64url'

/** URL length (chars) beyond which a share link defers to a project file. */
export const SHARE_LINK_LIMIT = 2000

const SERIALIZED_SECTIONS = ['imagery', 'base', 'reference']

/**
 * Encode the current composition into a compact base64url payload.
 * Only tabs referenced by the grid (plus the active tab) are included,
 * keeping the link as small as possible.
 */
export const encodeProjectUrl = ({ tabs, gridConfig, activeTabId }) => {
  const wantedIds = new Set()
  for (const cell of Object.values(gridConfig.cells || {})) {
    if (cell?.tabId) wantedIds.add(cell.tabId)
  }
  if (activeTabId) wantedIds.add(activeTabId)

  const t = {}
  for (const tab of tabs) {
    if (!wantedIds.has(tab.id)) continue
    const s = {}
    for (const sec of SERIALIZED_SECTIONS) s[sec] = tab.activeBySection?.[sec] || []
    t[tab.id] = {
      l: tab.label,
      d: tab.date,
      s,
      ...(tab.mapPosition?.center && tab.mapPosition.zoom != null
        ? { p: { c: tab.mapPosition.center, z: tab.mapPosition.zoom } }
        : {})
    }
  }

  const g = {
    rows: gridConfig.rows,
    cols: gridConfig.cols,
    width: gridConfig.width,
    height: gridConfig.height,
    cells: Object.fromEntries(
      Object.entries(gridConfig.cells || {})
        .filter(([, c]) => c?.tabId)
        .map(([idx, c]) => [idx, { t: c.tabId, r: c.rowSpan || 1, c: c.colSpan || 1 }])
    )
  }

  return b64urlEncode(JSON.stringify({ v: 1, a: activeTabId, g, t }))
}

/**
 * Decode a share payload back into { tabs, gridConfig, activeTabId }.
 * Tabs carry only the composition fields — layer settings / hidden layers
 * are filled in by the caller with defaults.
 */
export const decodeProjectUrl = (encoded) => {
  try {
    const payload = JSON.parse(b64urlDecode(encoded))
    if (payload?.v !== 1 || !payload.t || typeof payload.t !== 'object') return null

    const tabs = Object.entries(payload.t).map(([id, t]) => ({
      id,
      label: t.l || `View ${id}`,
      date: t.d,
      activeBySection: {
        imagery: Array.isArray(t.s?.imagery) ? t.s.imagery : [],
        base: Array.isArray(t.s?.base) ? t.s.base : [],
        reference: Array.isArray(t.s?.reference) ? t.s.reference : []
      },
      mapPosition: t.p?.c && t.p.z != null ? { center: t.p.c, zoom: t.p.z } : undefined
    }))

    const g = payload.g || {}
    const gridConfig = {
      rows: Math.max(1, Math.min(Number(g.rows) || 1, 5)),
      cols: Math.max(1, Math.min(Number(g.cols) || 1, 5)),
      width: Number(g.width) || 1600,
      height: Number(g.height) || 900,
      cells: {},
      captions: {}
    }
    for (const [idx, cell] of Object.entries(g.cells || {})) {
      const i = parseInt(idx, 10)
      if (Number.isFinite(i) && cell?.t && tabs.some(tab => tab.id === cell.t)) {
        gridConfig.cells[i] = {
          tabId: cell.t,
          rowSpan: Math.max(1, Number(cell.r) || 1),
          colSpan: Math.max(1, Number(cell.c) || 1)
        }
      }
    }

    return {
      tabs,
      gridConfig,
      activeTabId: payload.a && tabs.some(tab => tab.id === payload.a) ? payload.a : tabs[0]?.id || null
    }
  } catch {
    return null
  }
}

/** Full URL for a payload — keeps the current path, swaps the query string. */
export const projectUrlFor = (payload) => {
  const base = window.location.href.split('?')[0]
  return `${base}?p=${payload}`
}
