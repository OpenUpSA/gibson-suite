// Full-fidelity project export / import (JSON file) — the single save and
// share mechanism: everything (views, grid, compare, timelapse + captions)
// travels together, so loading a project is all-or-nothing.

export const PROJECT_VERSION = 1

export const serializeProject = ({ tabs, gridConfig, compareCaptions, compareMode, activeTabId, timelapse }) => ({
  version: PROJECT_VERSION,
  savedAt: new Date().toISOString(),
  activeTabId,
  tabs: tabs.map(tab => ({
    id: tab.id,
    label: tab.label,
    date: tab.date,
    activeBySection: tab.activeBySection,
    layerSettings: tab.layerSettings,
    hiddenLayers: Array.from(tab.hiddenLayers || []),
    mapPosition: tab.mapPosition
  })),
  grid: gridConfig,
  compareCaptions,
  compareMode,
  timelapse
})

/**
 * Parse + validate a project file.
 * @returns {{ tabs, gridConfig, compareCaptions, compareMode, activeTabId, timelapse } | null}
 *          null when the file is not a valid project for this version.
 */
export const deserializeProject = (jsonText) => {
  try {
    const p = JSON.parse(jsonText)
    if (p?.version !== PROJECT_VERSION || !Array.isArray(p.tabs) || !p.grid) return null

    const tabs = p.tabs
      .filter(t => t && typeof t.id === 'string')
      .map(t => ({
        id: t.id,
        label: t.label || `View ${t.id}`,
        date: t.date,
        activeBySection: {
          imagery: Array.isArray(t.activeBySection?.imagery) ? t.activeBySection.imagery : [],
          base: Array.isArray(t.activeBySection?.base) ? t.activeBySection.base : [],
          reference: Array.isArray(t.activeBySection?.reference) ? t.activeBySection.reference : []
        },
        layerSettings: t.layerSettings || {},
        hiddenLayers: new Set(Array.isArray(t.hiddenLayers) ? t.hiddenLayers : []),
        mapPosition: t.mapPosition || undefined
      }))
    if (tabs.length === 0) return null

    const g = p.grid
    const gridConfig = {
      rows: Math.max(1, Math.min(Number(g.rows) || 1, 5)),
      cols: Math.max(1, Math.min(Number(g.cols) || 1, 5)),
      width: Math.max(320, Number(g.width) || 1600),
      height: Math.max(240, Number(g.height) || 900),
      cells: {},
      captions: g.captions || {}
    }
    for (const [idx, cell] of Object.entries(g.cells || {})) {
      const i = parseInt(idx, 10)
      if (Number.isFinite(i) && cell?.tabId && tabs.some(tab => tab.id === cell.tabId)) {
        gridConfig.cells[i] = {
          tabId: cell.tabId,
          rowSpan: Math.max(1, Number(cell.rowSpan) || 1),
          colSpan: Math.max(1, Number(cell.colSpan) || 1)
        }
      }
    }

    const activeTabId = p.activeTabId && tabs.some(tab => tab.id === p.activeTabId)
      ? p.activeTabId
      : tabs[0].id

    return { tabs, gridConfig, compareCaptions: p.compareCaptions, compareMode: p.compareMode, activeTabId, timelapse: p.timelapse }
  } catch {
    return null
  }
}

export const defaultProjectFilename = () => {
  const d = new Date().toISOString().slice(0, 10)
  return `gibson-project-${d}.json`
}

export const downloadProjectFile = (project, filename = defaultProjectFilename()) => {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
