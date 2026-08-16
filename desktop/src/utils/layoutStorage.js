// Layout and state persistence utilities

const STORAGE_KEY_LAYOUT = 'gibson-pane-layout'
const STORAGE_KEY_STATE = 'gibson-app-state'

export const PRESET_LAYOUTS = {
  twoColumn: [
    { x: 0, y: 0, w: 6, h: 8, i: 'tab-1', static: false },
    { x: 6, y: 0, w: 6, h: 8, i: 'tab-2', static: false }
  ],
  threeColumn: [
    { x: 0, y: 0, w: 4, h: 8, i: 'tab-1', static: false },
    { x: 4, y: 0, w: 4, h: 8, i: 'tab-2', static: false },
    { x: 8, y: 0, w: 4, h: 8, i: 'tab-3', static: false }
  ],
  stacked: [
    { x: 0, y: 0, w: 12, h: 4, i: 'tab-1', static: false },
    { x: 0, y: 4, w: 12, h: 4, i: 'tab-2', static: false }
  ],
  feature: [
    { x: 0, y: 0, w: 8, h: 8, i: 'tab-1', static: false },
    { x: 8, y: 0, w: 4, h: 4, i: 'tab-2', static: false },
    { x: 8, y: 4, w: 4, h: 4, i: 'tab-3', static: false }
  ]
}

export const defaultLayout = PRESET_LAYOUTS.twoColumn

/**
 * Save layout to localStorage
 */
export function saveLayout(layout) {
  try {
    localStorage.setItem(STORAGE_KEY_LAYOUT, JSON.stringify(layout))
  } catch (err) {
    console.warn('Failed to save layout:', err)
  }
}

/**
 * Load layout from localStorage
 */
export function loadLayout() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LAYOUT)
    return stored ? JSON.parse(stored) : null
  } catch (err) {
    console.warn('Failed to load layout:', err)
    return null
  }
}

/**
 * Generate default layout for given tab IDs
 */
export function generateDefaultLayout(tabIds) {
  const colWidth = 12 / Math.min(tabIds.length, 2)
  return tabIds.map((id, index) => ({
    x: (index % 2) * colWidth,
    y: Math.floor(index / 2) * 8,
    w: colWidth,
    h: 8,
    i: id,
    static: false
  }))
}

/**
 * Save full app state (tabs, layers, dates) to localStorage
 */
export function saveAppState(tabs, activeTabId) {
  try {
    const state = {
      timestamp: Date.now(),
      tabs: tabs.map(tab => ({
        id: tab.id,
        label: tab.label,
        activeBySection: tab.activeBySection,
        layerSettings: tab.layerSettings,
        hiddenLayers: Array.from(tab.hiddenLayers),
        date: tab.date
      })),
      activeTabId
    }
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state))
  } catch (err) {
    console.warn('Failed to save app state:', err)
  }
}

/**
 * Load app state from localStorage
 */
export function loadAppState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_STATE)
    if (!stored) return null

    const state = JSON.parse(stored)
    return {
      ...state,
      tabs: state.tabs.map(tab => ({
        ...tab,
        hiddenLayers: new Set(tab.hiddenLayers)
      }))
    }
  } catch (err) {
    console.warn('Failed to load app state:', err)
    return null
  }
}

/**
 * Clear all stored data
 */
export function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY_LAYOUT)
    localStorage.removeItem(STORAGE_KEY_STATE)
  } catch (err) {
    console.warn('Failed to clear storage:', err)
  }
}

/**
 * Export layout as JSON
 */
export function exportLayout(layout, filename = 'layout.json') {
  const dataStr = JSON.stringify(layout, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Import layout from file
 */
export function importLayout(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const layout = JSON.parse(e.target.result)
        resolve(layout)
      } catch (err) {
        reject(new Error('Invalid layout file'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
