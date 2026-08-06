import { useCallback, useEffect, useRef, useState, Fragment } from 'react'
import { Icon } from '@iconify/react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './Globe.css'

// ── Autosave utilities ────────────────────────────────────────────────
const AUTOSAVE_KEY = 'gibson-app-state'
const PANE_SIZES_KEY = 'gibson-pane-sizes'
const GRID_CONFIG_KEY = 'gibson-grid-config'

// Grid layout presets: { rows, cols, name }
const GRID_PRESETS = {
  '2x2': { rows: 2, cols: 2, name: '2×2 (4 views)' },
  '1x2': { rows: 1, cols: 2, name: '1×2 (2 views)' },
  '2x1': { rows: 2, cols: 1, name: '2×1 (2 views)' },
  '2x3': { rows: 2, cols: 3, name: '2×3 (6 views)' },
  '2x4': { rows: 2, cols: 4, name: '2×4 (8 views)' },
  '3x3': { rows: 3, cols: 3, name: '3×3 (9 views)' }
}

const DEFAULT_GRID_CONFIG = { 
  rows: 1, 
  cols: 1, 
  width: '100%',
  height: '100%',
  cells: {}, // cells: { cellIndex: { tabId, rowSpan: 1, colSpan: 1 } }
  captions: {} // captions: { cellIndex: { text, position, overlayColor, overlayOpacity, textColor, visible } }
}

const DEFAULT_CAPTION = {
  text: '%date%\n%layer%',
  position: 'bottom-left',
  overlayColor: '#000000',
  overlayOpacity: 0.55,
  textColor: '#ffffff',
  visible: false
}

const CAPTION_POSITIONS = [
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' }
]

const saveGridConfig = (config) => {
  try {
    localStorage.setItem(GRID_CONFIG_KEY, JSON.stringify(config))
  } catch (e) {
    console.error('Failed to save grid config:', e)
  }
}

const loadGridConfig = () => {
  try {
    const saved = localStorage.getItem(GRID_CONFIG_KEY)
    if (saved) {
      let config = JSON.parse(saved)
      // Migrate old viewAssignments format to new cells format
      if (config.viewAssignments && !config.cells) {
        config.cells = {}
        for (const [cellIndex, tabId] of Object.entries(config.viewAssignments)) {
          config.cells[cellIndex] = { tabId, rowSpan: 1, colSpan: 1 }
        }
        delete config.viewAssignments
      }
      // Ensure captions exists
      if (!config.captions) config.captions = {}
      // Ensure width/height are set
      if (!config.width) config.width = '100%'
      if (!config.height) config.height = '100%'
      // Ensure rows/cols are set
      if (!config.rows) config.rows = 1
      if (!config.cols) config.cols = 1
      return config
    }
  } catch (e) {
    console.error('Failed to load grid config:', e)
  }
  return DEFAULT_GRID_CONFIG
}

const savePaneSizes = (sizes) => {
  try {
    localStorage.setItem(PANE_SIZES_KEY, JSON.stringify(sizes))
  } catch (e) {
    console.error('Failed to save pane sizes:', e)
  }
}

const loadPaneSizes = (tabCount) => {
  try {
    const saved = localStorage.getItem(PANE_SIZES_KEY)
    if (saved) {
      const sizes = JSON.parse(saved)
      // Verify sizes array matches tab count
      if (Array.isArray(sizes) && sizes.length === tabCount) {
        return sizes
      }
    }
  } catch (e) {
    console.error('Failed to load pane sizes:', e)
  }
  // Default: equal widths
  return Array(tabCount).fill(100 / Math.max(tabCount, 1))
}

const saveAppState = (appState) => {
  try {
    const serialized = {
      ...appState,
      tabs: appState.tabs.map(tab => ({
        ...tab,
        hiddenLayers: Array.from(tab.hiddenLayers) // Convert Set to Array
      }))
    }
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serialized))
  } catch (e) {
    console.error('Failed to save app state:', e)
  }
}

const loadAppState = () => {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        ...parsed,
        tabs: parsed.tabs.map(tab => ({
          ...tab,
          hiddenLayers: new Set(tab.hiddenLayers) // Convert Array back to Set
        }))
      }
    }
  } catch (e) {
    console.error('Failed to load app state:', e)
  }
  return null
}
import SideToolbar from './SideToolbar'
import TabbedSidebar from './TabbedSidebar'
import AddLayerModal from './AddLayerModal'
import DatePicker from './DatePicker'

import layersConfig from '../config/layers.json'
import { buildTileUrlTemplate } from '../config/tileUrl'

// Layer catalogue — everything the user can add to the map, grouped by section
// in layers.json: sections.base / sections.imagery / sections.reference.
const SECTIONS_CFG = layersConfig.sections || {}
const BASE_LAYERS = SECTIONS_CFG.imagery || [] // imagery section holds the daily true-color bases
const OVERLAY_LAYERS = SECTIONS_CFG.reference || [] // reference section holds the static overlays
const layerCatalog = Object.values(SECTIONS_CFG).flat()
const layerById = new Map(layerCatalog.map(l => [l.id, l]))
const { mapSettings, wmtsBaseUrl } = layersConfig

// Section config — drives both the sidebar sections and the map stacking.
// Stacking order: base at the bottom, imagery above it, reference on top.
const SECTION_ORDER = ['reference', 'imagery', 'base']
const SECTION_TITLES = {
  base: 'Base layers',
  imagery: 'Imagery layers',
  reference: 'Reference layers'
}

const layerSection = (layer) => layer.section || (layer.role === 'base' ? 'base' : 'reference')

// Flatten sections into a single ordered list — index 0 renders ON TOP.
const flattenActive = (bySection) => SECTION_ORDER.flatMap(s => bySection[s] || [])

// GIBS publishes daily imagery with ~1 day lag — default to yesterday (UTC).
const defaultDate = (() => {
  const now = new Date()
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  return yesterday.toISOString().split('T')[0]
})()

// Base imagery is dated (yesterday). Static reference overlays use GIBS's
// literal 'default' time keyword, so they are date-independent.
const layerTime = (layer, date) => (layerSection(layer) === 'reference' ? 'default' : (date || defaultDate))

// Per-layer resolution presets — caps the finest zoom level of tiles requested.
// The base layer is native at Level9; lower qualities let coarser tiles
// upscale so fewer/harder-to-fetch tiles load (snappier, blurrier zoom-in).
const QUALITY_MAXZOOM = {
  high: 9, // Level9 — native resolution
  medium: 8,
  low: 7
}

// Default view framed on the whole of Africa.
const INITIAL_CENTER = [17, 5] // [lng, lat]
const INITIAL_ZOOM = 2.5

// Active layers grouped by section. New layers are added to the front (top)
// of their section. Defaults: VIIRS imagery + coastlines reference overlay.
const initialBySection = {
  base: [],
  imagery: [BASE_LAYERS.find(l => l.id === 'VIIRS_NOAA21_CorrectedReflectance_TrueColor')?.id].filter(Boolean),
  reference: [OVERLAY_LAYERS.find(l => l.id === 'Coastlines')?.id].filter(Boolean)
}

// Per-layer settings. Only imagery layers have adjustable opacity — base is
// fixed at 1, reference at 0.9, and neither exposes an opacity control.
// Default opacity: base 1, imagery 1, reference 0.9.
const DEFAULT_SETTINGS = (layer) => ({
  quality: 'low',
  opacity: layerSection(layer) === 'imagery' ? 1 : (layerSection(layer) === 'base' ? 1 : 0.9)
})
const initialSettings = Object.fromEntries(
  layerCatalog.map(l => [l.id, DEFAULT_SETTINGS(l)])
)

const rasterSource = (tiles, maxzoom) => ({
  type: 'raster',
  tiles,
  tileSize: 256,
  minzoom: 0,
  maxzoom,
  attribution: 'NASA GIBS',
  bounds: [-180, -85.0511287798, 180, 85.0511287798]
})

// ── Crossfade helpers ────────────────────────────────────────────────
// Exactly matches the legacy Map.jsx updateGibsLayer pattern:
//   1. Add new layer at opacity 0 with raster-opacity-transition defined.
//   2. Wait for sourcedata → isSourceLoaded → idle.
//   3. Fade IN new + fade OUT old simultaneously via setPaintProperty.
//   4. Remove old after timeout.
// This works because MapLibre animates the transition on the SAME tick
// that both setPaintProperty calls fire — no black frames.

// MapInstance component - renders a single map pane for a tab
function MapInstance({ tab, layerById, layerCatalog, wmtsBaseUrl, mapSettings, onMapReady, onMapPositionChange }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerSrcMapRef = useRef({})
  const transitionsRef = useRef({})
  const prevDateRef = useRef(tab.date)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Use saved position from tab, or fall back to default position
    const savedPosition = tab.mapPosition || { center: INITIAL_CENTER, zoom: INITIAL_ZOOM }
    const center = savedPosition.center || mapSettings.center || [0, 30]
    const zoom = savedPosition.zoom !== undefined ? savedPosition.zoom : (mapSettings.zoom || 4)

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: []
      },
      center: center,
      zoom: zoom,
      minZoom: mapSettings.minZoom || 2,
      maxZoom: mapSettings.maxZoom || 12,
      attributionControl: false
    })

    map.on('load', () => {
      mapRef.current = map
      setMapReady(true)
      onMapReady?.(map)

      // Listen for map position changes (move and zoom)
      const handleMapChange = () => {
        const center = map.getCenter()
        const zoom = map.getZoom()
        onMapPositionChange?.({
          center: [center.lng, center.lat],
          zoom: zoom
        })
      }

      map.on('move', handleMapChange)
      map.on('zoom', handleMapChange)
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update map layers when tab state changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const activeLayers = flattenActive(tab.activeBySection)
    const prevLayers = Object.keys(layerSrcMapRef.current)
    const dateChanged = prevDateRef.current !== tab.date
    prevDateRef.current = tab.date

    // Remove layers that are no longer active
    for (const layerId of prevLayers) {
      if (!activeLayers.includes(layerId)) {
        const srcId = layerSrcMapRef.current[layerId]
        try {
          if (map.getLayer(srcId)) map.removeLayer(srcId)
          if (map.getSource(srcId)) map.removeSource(srcId)
        } catch {}
        delete layerSrcMapRef.current[layerId]
      }
    }

    // Add/update active layers and reorder them
    for (const layerId of activeLayers) {
      const layer = layerById.get(layerId)
      if (!layer) continue

      const srcId = `layer-${layerId}`
      const settings = tab.layerSettings[layerId] ?? { quality: 'low', opacity: 1 }
      const isHidden = tab.hiddenLayers.has(layerId)
      const targetOpacity = isHidden ? 0 : settings.opacity

      if (!map.getSource(srcId)) {
        try {
          const url = buildTileUrlTemplate({ wmtsBaseUrl }, layer, layerTime(layer, tab.date))
          const maxzoom = QUALITY_MAXZOOM[settings.quality]
          map.addSource(srcId, rasterSource([url], maxzoom))
          map.addLayer({
            id: srcId,
            type: 'raster',
            source: srcId,
            paint: {
              'raster-opacity': targetOpacity,
              'raster-opacity-transition': { duration: 300, delay: 0 }
            }
          })
          layerSrcMapRef.current[layerId] = srcId
        } catch (err) {
          console.warn('Failed to add layer:', layerId, err)
        }
      } else if (map.getLayer(srcId)) {
        // Layer exists - update opacity
        try {
          map.setPaintProperty(srcId, 'raster-opacity', targetOpacity)
        } catch {}
        
        // If date changed, update the tile source URLs
        if (dateChanged) {
          try {
            const source = map.getSource(srcId)
            if (source && typeof source.setTiles === 'function') {
              const url = buildTileUrlTemplate({ wmtsBaseUrl }, layer, layerTime(layer, tab.date))
              console.warn(`[MapInstance] Updating tiles for tab "${tab.label}": new URL =`, url)
              source.setTiles([url])
              // Trigger a repaint to immediately show the new tiles
              map.triggerRepaint()
            }
          } catch (err) {
            console.warn('Failed to update source tiles for date change:', layerId, err)
          }
        }
      }
    }

    // Reorder layers to match active order (reverse because 0 = top in our model)
    for (let i = activeLayers.length - 1; i >= 0; i--) {
      const layerId = activeLayers[i]
      const srcId = `layer-${layerId}`
      if (map.getLayer(srcId)) {
        try {
          map.moveLayer(srcId)
        } catch {}
      }
    }
  }, [tab.activeBySection, tab.layerSettings, tab.hiddenLayers, tab.date, mapReady, layerById, wmtsBaseUrl])

  return <div ref={containerRef} className="globe-map" />
}

export default function Globe() {
  const [activeTool, setActiveTool] = useState('layers')
  const [addLayerOpen, setAddLayerOpen] = useState(false)

  // ── Tab state management ──────────────────────────────────────────────
  // Load saved state from localStorage, or use defaults
  const savedState = useRef(loadAppState())
  const [tabs, setTabs] = useState(() => {
    if (savedState.current?.tabs) {
      return savedState.current.tabs
    }
    return [
      {
        id: 'tab-1',
        label: 'View 1',
        activeBySection: initialBySection,
        layerSettings: initialSettings,
        hiddenLayers: new Set(),
        date: defaultDate,
        mapPosition: { center: INITIAL_CENTER, zoom: INITIAL_ZOOM }
      }
    ]
  })
  const [activeTabId, setActiveTabId] = useState(() => {
    return savedState.current?.activeTabId || 'tab-1'
  })
  const [isTabbedMode, setIsTabbedMode] = useState(true)

  // ── Pane resize state ──────────────────────────────────────────────
  const [paneSizes, setPaneSizes] = useState(() => loadPaneSizes(tabs.length))
  const [isResizing, setIsResizing] = useState(false)
  const resizeIndexRef = useRef(null)
  const containerRef = useRef(null)

  // ── Grid layout state ──────────────────────────────────────────────
  const [layoutMode, setLayoutMode] = useState(false) // Toggle grid editor in sidebar
  const [gridViewActive, setGridViewActive] = useState(false) // Toggle grid view vs single view
  const [gridConfig, setGridConfig] = useState(() => loadGridConfig())
  const [draggedTabId, setDraggedTabId] = useState(null) // For drag-drop in layout mode
  const [selectedCell, setSelectedCell] = useState(null) // For grid editor cell selection
  const [cellSpans, setCellSpans] = useState({}) // Temporary span state for editing
  const [gridDrag, setGridDrag] = useState(null) // { fromCell, toCell } for drag-to-reassign
  const [gridResize, setGridResize] = useState(null) // { cellIndex, edge, startMouse, startRowSpan, startColSpan }

  // Auto-assign first tab to cell 0 when grid has no cells
  useEffect(() => {
    if (tabs.length > 0 && Object.keys(gridConfig.cells).length === 0) {
      const newCells = { 0: { tabId: tabs[0].id, rowSpan: 1, colSpan: 1 } }
      const newConfig = { ...gridConfig, cells: newCells }
      setGridConfig(newConfig)
      saveGridConfig(newConfig)
    }
  }, []) // Only on mount

  // Get active tab's state
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  const activeBySection = activeTab.activeBySection
  const layerSettings = activeTab.layerSettings
  const hiddenLayers = activeTab.hiddenLayers

  const updateActiveTab = useCallback((updates) => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId ? { ...tab, ...updates } : tab
    ))
  }, [activeTabId])

  const handleMapPositionChange = useCallback((newPosition) => {
    updateActiveTab({ mapPosition: newPosition })
  }, [updateActiveTab])

  const handleTabDateChange = useCallback((newDate) => {
    updateActiveTab({ date: newDate })
  }, [updateActiveTab])

  // Wrappers to update the active tab's state
  const setActiveBySectionTabbed = useCallback((updater) => {
    if (typeof updater === 'function') {
      updateActiveTab({ activeBySection: updater(activeBySection) })
    } else {
      updateActiveTab({ activeBySection: updater })
    }
  }, [activeBySection, updateActiveTab])

  const setLayerSettingsTabbed = useCallback((updater) => {
    if (typeof updater === 'function') {
      updateActiveTab({ layerSettings: updater(layerSettings) })
    } else {
      updateActiveTab({ layerSettings: updater })
    }
  }, [layerSettings, updateActiveTab])

  const setHiddenLayersTabbed = useCallback((updater) => {
    if (typeof updater === 'function') {
      updateActiveTab({ hiddenLayers: updater(hiddenLayers) })
    } else {
      updateActiveTab({ hiddenLayers: updater })
    }
  }, [hiddenLayers, updateActiveTab])

  const addLayer = (layer) => {
    const section = layerSection(layer)
    setActiveBySectionTabbed(prev => {
      if (prev[section].includes(layer.id)) return prev
      return { ...prev, [section]: [layer.id, ...prev[section]] }
    })
    setAddLayerOpen(false)
  }

  const removeLayer = (id) => {
    const section = layerSection(layerById.get(id) || {})
    setActiveBySectionTabbed(prev => ({ ...prev, [section]: prev[section].filter(x => x !== id) }))
  }

  const reorderSection = (section, nextIds) => {
    setActiveBySectionTabbed(prev => ({ ...prev, [section]: nextIds }))
  }

  const updateLayerSettings = (id, patch) => {
    setLayerSettingsTabbed(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const toggleVisibility = useCallback((id) => {
    setHiddenLayersTabbed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [setHiddenLayersTabbed])

  // Toolbar: clicking the active tool closes its panel; clicking another
  // switches to it. Opening one panel closes the other.
  const handleToolClick = (tool) => {
    setActiveTool(prev => (prev === tool ? null : tool))
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      // Ctrl+Shift+1 — toggle layers sidebar
      if (e.ctrlKey && e.shiftKey && e.code === 'Digit1') {
        e.preventDefault()
        setActiveTool(prev => (prev === 'layers' ? null : 'layers'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Autosave app state to localStorage (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveAppState({ tabs, activeTabId })
    }, 500) // Debounce 500ms
    return () => clearTimeout(timer)
  }, [tabs, activeTabId])

  // ── Pane resize handlers ──────────────────────────────────────────────
  useEffect(() => {
    const handleMouseDown = (e, index) => {
      e.preventDefault()
      setIsResizing(true)
      resizeIndexRef.current = index
    }

    const handleMouseMove = (e) => {
      if (!isResizing || resizeIndexRef.current === null || !containerRef.current) return

      const container = containerRef.current
      const rect = container.getBoundingClientRect()
      const newX = e.clientX - rect.left
      const percent = (newX / rect.width) * 100

      setPaneSizes(prev => {
        const newSizes = [...prev]
        const index = resizeIndexRef.current
        const oldSize1 = newSizes[index]
        const oldSize2 = newSizes[index + 1]
        const totalSize = oldSize1 + oldSize2

        // Constraint: each pane min 20%, max 80%
        let newSize1 = percent
        newSize1 = Math.max(20, Math.min(newSize1, 80))
        let newSize2 = totalSize - newSize1

        if (newSize2 < 20) {
          newSize2 = 20
          newSize1 = totalSize - newSize2
        } else if (newSize2 > 80) {
          newSize2 = 80
          newSize1 = totalSize - newSize2
        }

        newSizes[index] = newSize1
        newSizes[index + 1] = newSize2
        return newSizes
      })
    }

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false)
        savePaneSizes(paneSizes)
        resizeIndexRef.current = null
      }
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing, paneSizes])

  // Update pane sizes when tab count changes
  useEffect(() => {
    if (paneSizes.length !== tabs.length) {
      setPaneSizes(loadPaneSizes(tabs.length))
    }
  }, [tabs.length])

  const handleTabAdd = useCallback(() => {
    const newId = `tab-${Date.now()}`
    const sourceTab = tabs.find(t => t.id === activeTabId) || tabs[0]
    const newTab = {
      id: newId,
      label: `View ${tabs.length + 1}`,
      activeBySection: JSON.parse(JSON.stringify(sourceTab.activeBySection)),
      layerSettings: { ...sourceTab.layerSettings },
      hiddenLayers: new Set(sourceTab.hiddenLayers),
      date: sourceTab.date,
      mapPosition: { ...sourceTab.mapPosition }
    }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newId)
  }, [tabs, activeTabId])

  const handleTabRemove = useCallback((tabId) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev
      const newTabs = prev.filter(t => t.id !== tabId)
      if (activeTabId === tabId) {
        setActiveTabId(newTabs[0].id)
      }
      return newTabs
    })
  }, [activeTabId])

  const handleTabChange = useCallback((tabId) => {
    setActiveTabId(tabId)
  }, [])

  const handleGridPresetApply = useCallback((presetKey) => {
    const preset = GRID_PRESETS[presetKey]
    if (preset) {
      // Keep existing assignments, just update grid dimensions
      const newConfig = {
        rows: preset.rows,
        cols: preset.cols,
        width: gridConfig.width,
        height: gridConfig.height,
        cells: { ...gridConfig.cells }
      }
      setGridConfig(newConfig)
      saveGridConfig(newConfig)
    }
  }, [gridConfig])

  const handleGridDimensionChange = useCallback((rows, cols) => {
    const newConfig = {
      rows: Math.max(1, Math.min(rows, 5)),
      cols: Math.max(1, Math.min(cols, 5)),
      width: gridConfig.width,
      height: gridConfig.height,
      cells: gridConfig.cells
    }
    setGridConfig(newConfig)
    saveGridConfig(newConfig)
  }, [gridConfig])

  const handleAssignViewToCell = useCallback((cellIndex, tabId) => {
    const newCells = { ...gridConfig.cells }
    if (newCells[cellIndex]?.tabId === tabId) {
      delete newCells[cellIndex] // Toggle off
    } else {
      newCells[cellIndex] = { 
        tabId, 
        rowSpan: newCells[cellIndex]?.rowSpan || 1,
        colSpan: newCells[cellIndex]?.colSpan || 1
      }
    }
    const newConfig = { ...gridConfig, cells: newCells }
    setGridConfig(newConfig)
    saveGridConfig(newConfig)
  }, [gridConfig])

  const handleGridSizeChange = useCallback((height, width) => {
    const newConfig = { ...gridConfig, width, height }
    setGridConfig(newConfig)
    saveGridConfig(newConfig)
  }, [gridConfig])

  const handleCellSpanChange = useCallback((cellIndex, rowSpan, colSpan) => {
    const newCells = { ...gridConfig.cells }
    if (newCells[cellIndex]) {
      newCells[cellIndex] = { ...newCells[cellIndex], rowSpan, colSpan }
      const newConfig = { ...gridConfig, cells: newCells }
      setGridConfig(newConfig)
      saveGridConfig(newConfig)
    }
  }, [gridConfig])

  const handleClearCell = useCallback((cellIndex) => {
    const newCells = { ...gridConfig.cells }
    delete newCells[cellIndex]
    const newConfig = { ...gridConfig, cells: newCells }
    setGridConfig(newConfig)
    saveGridConfig(newConfig)
    setSelectedCell(null)
  }, [gridConfig])

  // ── Caption handlers ──────────────────────────────────────────────────
  const handleCaptionChange = useCallback((cellIndex, field, value) => {
    const newCaptions = { ...gridConfig.captions }
    newCaptions[cellIndex] = { ...(newCaptions[cellIndex] || DEFAULT_CAPTION), [field]: value }
    const newConfig = { ...gridConfig, captions: newCaptions }
    setGridConfig(newConfig)
    saveGridConfig(newConfig)
  }, [gridConfig])

  const handleCaptionToggleVisible = useCallback((cellIndex) => {
    const current = gridConfig.captions[cellIndex] || DEFAULT_CAPTION
    handleCaptionChange(cellIndex, 'visible', !current.visible)
  }, [gridConfig.captions, handleCaptionChange])

  // ── Interactive grid drag/resize ────────────────────────────────────
  const handleGridDragStart = useCallback((e, cellIndex) => {
    e.preventDefault()
    e.stopPropagation()
    const cell = gridConfig.cells[cellIndex]
    if (!cell) return

    setGridDrag({ fromCell: cellIndex, toCell: cellIndex })

    const handleMove = (ev) => {
      const gridEl = document.querySelector('.grid-editor-canvas-grid')
      if (!gridEl) return
      const rect = gridEl.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      const cellW = rect.width / gridConfig.cols
      const cellH = rect.height / gridConfig.rows
      const col = Math.max(0, Math.min(Math.floor(x / cellW), gridConfig.cols - 1))
      const row = Math.max(0, Math.min(Math.floor(y / cellH), gridConfig.rows - 1))
      const target = row * gridConfig.cols + col
      setGridDrag(prev => prev ? { ...prev, toCell: target } : null)
    }

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      setGridDrag(prev => {
        if (prev && prev.fromCell !== prev.toCell) {
          // Move view from source to target (swap or move)
          const srcCell = gridConfig.cells[prev.fromCell]
          const tgtCell = gridConfig.cells[prev.toCell]
          const newCells = { ...gridConfig.cells }
          if (tgtCell) {
            // Swap
            newCells[prev.fromCell] = { ...tgtCell }
            newCells[prev.toCell] = { ...srcCell }
          } else {
            // Move
            newCells[prev.toCell] = { ...srcCell }
            delete newCells[prev.fromCell]
          }
          const newConfig = { ...gridConfig, cells: newCells }
          setGridConfig(newConfig)
          saveGridConfig(newConfig)
        }
        return null
      })
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [gridConfig])

  const handleGridResizeStart = useCallback((e, cellIndex, edge) => {
    e.preventDefault()
    e.stopPropagation()
    const cellData = gridConfig.cells[cellIndex]
    if (!cellData) return

    const startX = e.clientX
    const startY = e.clientY
    const startRowSpan = cellData.rowSpan || 1
    const startColSpan = cellData.colSpan || 1

    setGridResize({ cellIndex, edge, startX, startY, startRowSpan, startColSpan })

    const handleMove = (ev) => {
      const gridEl = document.querySelector('.grid-editor-canvas-grid')
      if (!gridEl) return
      const rect = gridEl.getBoundingClientRect()
      const cellW = rect.width / gridConfig.cols
      const cellH = rect.height / gridConfig.rows
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY

      let newColSpan = startColSpan
      let newRowSpan = startRowSpan

      if (edge === 'right' || edge === 'corner') {
        newColSpan = Math.max(1, Math.min(startColSpan + Math.round(dx / cellW), gridConfig.cols - cellIndex % gridConfig.cols))
      }
      if (edge === 'bottom' || edge === 'corner') {
        newRowSpan = Math.max(1, Math.min(startRowSpan + Math.round(dy / cellH), gridConfig.rows - Math.floor(cellIndex / gridConfig.cols)))
      }

      handleCellSpanChange(cellIndex, newRowSpan, newColSpan)
    }

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      setGridResize(null)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [gridConfig, handleCellSpanChange])

  const handleResizeStart = useCallback((e, index) => {
    e.preventDefault()
    setIsResizing(true)
    resizeIndexRef.current = index
  }, [])

  return (
    <div className="globe-root">
      {/* Main view — grid layout or single active tab */}
      {!layoutMode && gridViewActive && gridConfig.rows > 0 && gridConfig.cols > 0 && (
        <div className="globe-grid-view">
          <div className="globe-grid-container" style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
            gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
            gap: '3px',
            width: gridConfig.width || '100%',
            height: gridConfig.height || '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            overflow: 'hidden'
          }}>
            {Array.from({ length: gridConfig.rows * gridConfig.cols }).map((_, cellIndex) => {
              const cellData = gridConfig.cells[cellIndex]
              if (!cellData) return null
              const tab = tabs.find(t => t.id === cellData.tabId)
              const rowSpan = cellData.rowSpan || 1
              const colSpan = cellData.colSpan || 1
              const caption = gridConfig.captions[cellIndex]
              const resolvedText = caption?.visible && caption?.text
                ? caption.text
                    .replace(/%date%/g, tab?.date || '')
                    .replace(/%layer%/g, tab?.layer?.name || tab?.label || '')
                : null
              const captionLines = resolvedText ? resolvedText.split('\n') : []
              const posClass = caption?.position || 'bottom-left'
              return (
                <div key={cellIndex} className="globe-grid-cell" style={{
                  gridColumn: `span ${colSpan}`,
                  gridRow: `span ${rowSpan}`,
                }}>
                  {tab ? (
                    <MapInstance
                      tab={tab}
                      layerById={layerById}
                      layerCatalog={layerCatalog}
                      wmtsBaseUrl={wmtsBaseUrl}
                      mapSettings={mapSettings}
                      onMapReady={() => {}}
                      onMapPositionChange={handleMapPositionChange}
                    />
                  ) : (
                    <div className="globe-grid-empty">Empty</div>
                  )}
                  {caption?.visible && captionLines.length > 0 && (
                    <div className={`globe-grid-caption globe-grid-caption--${posClass}`}>
                      <div
                        className="globe-grid-caption-bg"
                        style={{
                          backgroundColor: caption.overlayColor || '#000',
                          opacity: caption.overlayOpacity ?? 0.55,
                        }}
                      />
                      <div className="globe-grid-caption-text" style={{ color: caption.textColor || '#fff' }}>
                        {captionLines.map((line, li) => (
                          <div key={li}>{line}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!layoutMode && !gridViewActive && activeTab && (
        <div className="globe-single-view">
          <MapInstance
            tab={activeTab}
            layerById={layerById}
            layerCatalog={layerCatalog}
            wmtsBaseUrl={wmtsBaseUrl}
            mapSettings={mapSettings}
            onMapReady={(map) => { /* store map instance if needed */ }}
            onMapPositionChange={handleMapPositionChange}
          />
        </div>
      )}

      <SideToolbar 
        activeTool={activeTool} 
        onToolClick={handleToolClick}
        onLayoutModeToggle={() => setLayoutMode(!layoutMode)}
        layoutModeActive={layoutMode}
      />
      <TabbedSidebar
        sections={SECTION_ORDER.map(s => ({ key: s, title: SECTION_TITLES[s], ids: activeBySection[s] || [] }))}
        layerById={layerById}
        layerSection={layerSection}
        layerSettings={layerSettings}
        hiddenLayers={hiddenLayers}
        layerCatalog={layerCatalog}
        onRemove={removeLayer}
        onReorder={reorderSection}
        onSettingsChange={updateLayerSettings}
        onToggleVisibility={toggleVisibility}
        onQuickAdd={addLayer}
        onAddClick={() => setAddLayerOpen(true)}
        open={activeTool === 'layers'}
        onClose={() => setActiveTool(null)}
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={handleTabChange}
        onTabAdd={handleTabAdd}
        onTabRemove={handleTabRemove}
        activeTabDate={activeTab.date}
        onTabDateChange={handleTabDateChange}
        gridConfig={gridConfig}
        selectedCell={selectedCell}
        onCellSelect={setSelectedCell}
        onPresetSelect={handleGridPresetApply}
        onDimensionChange={handleGridDimensionChange}
        onGridSizeChange={handleGridSizeChange}
        onCellSpanChange={handleCellSpanChange}
        onAssignView={handleAssignViewToCell}
        onClearCell={handleClearCell}
        gridViewActive={gridViewActive}
        onGridViewToggle={() => setGridViewActive(!gridViewActive)}
        onCaptionChange={handleCaptionChange}
        onCaptionToggleVisible={handleCaptionToggleVisible}
        defaultCaption={DEFAULT_CAPTION}
        captionPositions={CAPTION_POSITIONS}
      />
      <AddLayerModal
        catalog={layerCatalog}
        categories={layersConfig.categories || {}}
        activeLayers={flattenActive(activeBySection)}
        onAdd={addLayer}
        onRemove={removeLayer}
        open={addLayerOpen}
        onClose={() => setAddLayerOpen(false)}
      />

    </div>
  )
}
