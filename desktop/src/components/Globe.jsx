import { useCallback, useEffect, useRef, useState, Fragment, useMemo } from 'react'
import { Icon } from '@iconify/react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './Globe.css'

// ── Autosave utilities ────────────────────────────────────────────────
// Only "views" (tabs) persist automatically; grid/compare/timelapse are
// session-only and are saved/restored as a whole via project files.
const AUTOSAVE_KEY = 'gibson-app-state'

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
  width: 1600,
  height: 900,
  cells: {}, // cells: { cellIndex: { tabId, rowSpan: 1, colSpan: 1 } }
  captions: {} // captions: { cellIndex: { text, position, overlayColor, overlayOpacity, textColor, visible } }
}

const DEFAULT_CAPTION = {
  text: '%date%\n%layer%',
  position: 'bottom-left',
  overlayColor: '#000000',
  overlayOpacity: 0.55,
  textColor: '#ffffff',
  fontSize: 11,
  visible: false
}

const CAPTION_POSITIONS = [
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' }
]

// Replicates CSS grid auto-placement for cells with row/col spans.
// Cells are placed in index order at the first free spot, skipping
// positions covered by an earlier cell's span. Returns a map of
// cellIndex -> { row, col } (0-based). Cells that don't fit inside the
// grid (would land in an implicit row) get null and are not rendered.
const computeGridPlacement = (cells, rows, cols) => {
  const occupied = {} // "r,c" -> true
  const placement = {}
  for (let idx = 0; idx < rows * cols; idx++) {
    const cell = cells[idx]
    const rowSpan = cell?.rowSpan || 1
    const colSpan = cell?.colSpan || 1
    let found = null
    for (let r = 0; r < rows && !found; r++) {
      for (let c = 0; c < cols && !found; c++) {
        if (occupied[`${r},${c}`]) continue
        let fits = true
        for (let rr = r; rr < r + rowSpan && fits; rr++) {
          for (let cc = c; cc < c + colSpan && fits; cc++) {
            if (rr >= rows || cc >= cols || occupied[`${rr},${cc}`]) {
              fits = false
            }
          }
        }
        if (fits) {
          for (let rr = r; rr < r + rowSpan; rr++) {
            for (let cc = c; cc < c + colSpan; cc++) occupied[`${rr},${cc}`] = true
          }
          found = { row: r, col: c }
        }
      }
    }
    placement[idx] = found
  }
  return placement
}

// Grid layout and pane sizes are session-only — always start from defaults
// (or from a loaded project file), never restored from localStorage.
const equalPaneSizes = (tabCount) => Array(tabCount).fill(100 / Math.max(tabCount, 1))

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
import LayoutSidebar from './LayoutSidebar'
import AddLayerModal from './AddLayerModal'
import DatePicker from './DatePicker'
import TimelapsePanel from './TimelapsePanel'
import TimelapseBrowser, { PREVIEW_PAGE } from './TimelapseBrowser'
import TimelapseOverlay from './TimelapseOverlay'
import ComparePanel from './ComparePanel'
import CompareOverlay from './CompareOverlay'
import WelcomeModal from './WelcomeModal'
import TutorialTour from './TutorialTour'
import Toast from './Toast'

import layersConfig from '../config/layers.json'
import { buildTileUrlTemplate } from '../config/tileUrl'
import { availableDates } from '../utils/gibsCaps'
import { rectToBbox3857 } from '../utils/webMercator'
import { renderTimelapseGif, GIF_MAX_WIDTH } from '../utils/timelapseGif'
import { probeHasData, runPool } from '../utils/timelapseProbe'
import { serializeProject, deserializeProject, downloadProjectFile } from '../utils/projectFile'

// Layer catalogue — everything the user can add to the map, grouped by section
// in layers.json: sections.base / sections.imagery / sections.reference.
const SECTIONS_CFG = layersConfig.sections || {}
const BASE_LAYERS = SECTIONS_CFG.imagery || [] // imagery section holds the daily true-color bases
const OVERLAY_LAYERS = SECTIONS_CFG.reference || [] // reference section holds the static overlays
const layerCatalog = Object.values(SECTIONS_CFG).flat()
const layerById = new Map(layerCatalog.map(l => [l.id, l]))

// All active layer names for a tab, for the grid-cell info tooltip.
const cellLayerNames = (tab) => {
  if (!tab) return ''
  const ids = [
    ...(tab.activeBySection?.imagery || []),
    ...(tab.activeBySection?.base || []),
    ...(tab.activeBySection?.reference || [])
  ]
  return ids.map(id => layerById.get(id)?.name).filter(Boolean).join(', ') || tab.label || ''
}
const { mapSettings, wmtsBaseUrl, wmsBaseUrl } = layersConfig

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

// Shift an ISO date by whole days (UTC).
const addDaysIso = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

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

// Historical base fallback. The default true-color base (VIIRS NOAA-21) only
// starts 2023-02-10, so on older dates it renders as a blank void. When the
// active base layer has no coverage for the selected date, substitute a base
// that does (MODIS Terra true-color, available since 2000).
const BASE_FALLBACK_ID = 'MODIS_Terra_CorrectedReflectance_TrueColor'
const baseCoversDate = (layer, date) => {
  if (!layer) return false
  if (layer.startDate && date && date < layer.startDate) return false
  return true
}

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

// Shared exports for the minimalist share page (CompareShare) so it can
// rebuild maps from an encoded URL payload without duplicating config.
export { layerById, layerCatalog, wmtsBaseUrl, mapSettings, DEFAULT_SETTINGS }

const rasterSource = (tiles, maxzoom, layer) => ({
  type: 'raster',
  tiles,
  tileSize: 256,
  minzoom: 0,
  maxzoom,
  attribution: layer?.attribution || 'NASA GIBS',
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
export function MapInstance({ tab, layerById, layerCatalog, wmtsBaseUrl, mapSettings, onMapReady, onMapPositionChange, selectionMode, selectionRect, onSelectionChange }) {
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
      attributionControl: false,
      preserveDrawingBuffer: true
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
      let layer = layerById.get(layerId)
      if (!layer) continue

      // Historical base fallback: if the active base layer has no coverage for
      // the selected date, swap in a base that does (e.g. MODIS Terra).
      if (layerSection(layer) === 'base' && !baseCoversDate(layer, tab.date)) {
        const fb = layerById.get(BASE_FALLBACK_ID)
        if (fb && baseCoversDate(fb, tab.date)) layer = fb
      }

      const srcId = `layer-${layerId}`
      const settings = tab.layerSettings[layerId] ?? { quality: 'low', opacity: 1 }
      const isHidden = tab.hiddenLayers.has(layerId)
      const targetOpacity = isHidden ? 0 : settings.opacity

      if (!map.getSource(srcId)) {
        try {
          const url = buildTileUrlTemplate({ wmtsBaseUrl, wmsBaseUrl }, layer, layerTime(layer, tab.date))
          // Custom tile templates (e.g. OpenStreetMap) are served at full
          // zoom — the GIBS quality preset doesn't apply to them.
          // WMS layers (fires, etc.) are rasterised server-side at any zoom,
          // so don't cap them at the GIBS quality preset either.
          const maxzoom = layer.tiles ? 19 : (layer.wms ? 12 : QUALITY_MAXZOOM[settings.quality])
          map.addSource(srcId, rasterSource([url], maxzoom, layer))
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

        // If date changed, rebuild the source. We deliberately REMOVE and
        // RE-ADD the source+layer rather than calling source.setTiles([url]):
        // setTiles leaves the raster source mid-transition and maplibre's
        // raster painter can throw "Cannot read properties of undefined
        // (reading 'bind')" during the next render. Remove/re-add is the same
        // safe pattern the add branch and Map.jsx use.
        if (dateChanged) {
          try {
            const url = buildTileUrlTemplate({ wmtsBaseUrl, wmsBaseUrl }, layer, layerTime(layer, tab.date))
            if (map.getLayer(srcId)) map.removeLayer(srcId)
            if (map.getSource(srcId)) map.removeSource(srcId)
            const maxzoom = layer.tiles ? 19 : (layer.wms ? 12 : QUALITY_MAXZOOM[settings.quality])
            map.addSource(srcId, rasterSource([url], maxzoom, layer))
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

  return (
    <div ref={containerRef} className="globe-map" data-tour="map">
      {selectionMode && mapReady && (
        <TimelapseOverlay map={mapRef.current} rectangle={selectionRect} onChange={onSelectionChange} />
      )}
    </div>
  )
}

export default function Globe() {
  const [activeTool, setActiveTool] = useState('layers')
  const [addLayerOpen, setAddLayerOpen] = useState(false)

  // ── Welcome modal + guided tour ────────────────────────────────────
  // The welcome / about screen shows on first load (unless the user has
  // already dismissed it before). The tour runs on demand — from the
  // welcome modal, or by clicking the logo.
  const WELCOME_SEEN_KEY = 'gibson-welcome-seen'
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      return !localStorage.getItem(WELCOME_SEEN_KEY)
    } catch {
      return true
    }
  })
  const [tourRunning, setTourRunning] = useState(false)

  const closeWelcome = () => {
    setWelcomeOpen(false)
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, '1')
    } catch {
      // ignore storage failures — the modal just shows again next time
    }
  }

  const startTour = () => {
    setWelcomeOpen(false)
    setTourRunning(true)
  }

  // ── Compare tool state ──────────────────────────────────────────────
  // Selected views (tab ids) to overlay. Null until the user picks one —
  // the effective values below fall back to the first two tabs.
  const [compareAId, setCompareAId] = useState(null)
  const [compareBId, setCompareBId] = useState(null)
  // Per-side date overrides — only affect the compare view, never the shared tabs.
  const [compareDateOverrides, setCompareDateOverrides] = useState({ before: null, after: null })
  // Compare overlay stays visible when the sidebar is hidden (like grid view).
  const [compareViewActive, setCompareViewActive] = useState(false)

  // ── Timelapse tool state ────────────────────────────────────────────
  const [tlRect, setTlRect] = useState(null)              // [[swLng,swLat],[neLng,neLat]]
  const [tlAspect, setTlAspect] = useState(16 / 9)        // null = freeform, else ratio
  const [tlStartDate, setTlStartDate] = useState(() => addDaysIso(defaultDate, -30))
  const [tlEndDate, setTlEndDate] = useState(defaultDate)
  const [tlInterval, setTlInterval] = useState(1)         // days: 1 | 3 | 7 | 30
  const [tlAvailableDates, setTlAvailableDates] = useState([])
  const [tlPreviewLimit, setTlPreviewLimit] = useState(PREVIEW_PAGE)
  const [tlFrames, setTlFrames] = useState([])            // [{ time, label, delay, caption? }] — delay is seconds (default 2)
  const [tlEditFrameTime, setTlEditFrameTime] = useState(null) // frame.time being edited (caption/delay)
  const [tlStampDates, setTlStampDates] = useState(true)
  const [tlExporting, setTlExporting] = useState(false)
  const [tlFetching, setTlFetching] = useState(false)
  const [tlProgress, setTlProgress] = useState(null)      // { done, total } while exporting
  const [tlSelected, setTlSelected] = useState(() => new Set())
  // Preview browser: list mode first (no downloads) — images only load after
  // the user confirms. status maps date → 'loading' | 'ok' | 'empty' | 'error'.
  const [tlPreviewsConfirmed, setTlPreviewsConfirmed] = useState(false)
  const [tlPreviewStatus, setTlPreviewStatus] = useState(() => new Map())
  const [tlPreviewBusy, setTlPreviewBusy] = useState(false)
  // Per-date, per-layer coverage: Map<date, Map<layerId, boolean>>.
  const [tlCoverage, setTlCoverage] = useState(() => new Map())

  // Default per-frame delay (seconds) applied to newly added frames.
  const DEFAULT_FRAME_DELAY = 2

  // ── Tab state management ──────────────────────────────────────────────
  // Load saved views from localStorage — the only thing that auto-persists.
  const savedState = useRef(loadAppState())
  // True when this mount's views came from localStorage, so the UI can
  // tell the user their previous session was restored.
  const restoredFromStorage = Boolean(savedState.current?.tabs?.length)
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
  const [activeTabId, setActiveTabId] = useState(() => savedState.current?.activeTabId || 'tab-1')
  const [isTabbedMode, setIsTabbedMode] = useState(true)
  const [showRestoreToast, setShowRestoreToast] = useState(restoredFromStorage)

  // ── Pane resize state ──────────────────────────────────────────────
  const [paneSizes, setPaneSizes] = useState(() => equalPaneSizes(tabs.length))
  const [isResizing, setIsResizing] = useState(false)
  const resizeIndexRef = useRef(null)
  const containerRef = useRef(null)

  // ── Grid layout state ──────────────────────────────────────────────
  const [gridViewActive, setGridViewActive] = useState(false) // Toggle grid view vs single view
  const [gridConfig, setGridConfig] = useState(() => ({ ...DEFAULT_GRID_CONFIG }))
  const [draggedTabId, setDraggedTabId] = useState(null) // For drag-drop in layout mode
  const [selectedCell, setSelectedCell] = useState(null) // For grid editor cell selection
  const [cellSpans, setCellSpans] = useState({}) // Temporary span state for editing
  const [gridDrag, setGridDrag] = useState(null) // { fromCell, toCell } for drag-to-reassign
  const [gridResize, setGridResize] = useState(null) // { cellIndex, edge, startMouse, startRowSpan, startColSpan }
  const gridViewWrapRef = useRef(null) // .globe-grid-view — measured to compute letterbox scale
  const gridContainerRef = useRef(null) // .globe-grid-container — measured for export geometry
  const [gridScale, setGridScale] = useState(1) // uniform scale so on-screen box keeps configured aspect ratio

  // Placement map replicating CSS grid auto-placement (shared with export)
  const gridPlacement = useMemo(
    () => computeGridPlacement(gridConfig.cells, gridConfig.rows, gridConfig.cols),
    [gridConfig.cells, gridConfig.rows, gridConfig.cols]
  )

  // Keep the grid box's on-screen aspect ratio locked to gridConfig.width/height (letterboxed to
  // fit) instead of letting width/height clamp independently and distort the composition — a
  // distorted on-screen box otherwise causes the exported image to stretch (see handleExportGrid).
  useEffect(() => {
    const wrap = gridViewWrapRef.current
    if (!wrap || !gridViewActive) return
    const computeScale = () => {
      const availW = wrap.clientWidth
      const availH = wrap.clientHeight
      if (!availW || !availH) return
      setGridScale(Math.min(availW / gridConfig.width, availH / gridConfig.height, 1))
    }
    computeScale()
    const observer = new ResizeObserver(computeScale)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [gridViewActive, gridConfig.width, gridConfig.height])

  // Auto-assign first tab to cell 0 when grid has no cells
  useEffect(() => {
    if (tabs.length > 0 && Object.keys(gridConfig.cells).length === 0) {
      const newCells = { 0: { tabId: tabs[0].id, rowSpan: 1, colSpan: 1 } }
      setGridConfig({ ...gridConfig, cells: newCells })
    }
  }, []) // Only on mount

  // Entering layout mode shows the grid view. Closing the panel (or switching
  // to another tool) should NOT revert to the single view — grid view stays
  // active until the layout tool is reopened and grid view is explicitly left.
  useEffect(() => {
    if (activeTool === 'layout') setGridViewActive(true)
  }, [activeTool])

  // Entering compare mode shows the overlay; closing the panel keeps it.
  useEffect(() => {
    if (activeTool === 'compare') setCompareViewActive(true)
  }, [activeTool])

  // Get active tab's state
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  const activeBySection = activeTab.activeBySection
  const layerSettings = activeTab.layerSettings
  const hiddenLayers = activeTab.hiddenLayers

  // Effective compare views — fall back to the first two tabs.
  const compareTabA = tabs.find(t => t.id === compareAId) || tabs[0]
  const compareTabB = tabs.find(t => t.id === compareBId) || tabs[1] || tabs[0]

  // Date overrides shallow-copy the tab so only the compare view sees the new date.
  const effectiveCompareTabA = compareDateOverrides.before
    ? { ...compareTabA, date: compareDateOverrides.before }
    : compareTabA
  const effectiveCompareTabB = compareDateOverrides.after
    ? { ...compareTabB, date: compareDateOverrides.after }
    : compareTabB

  const handleCompareDateChange = useCallback((side, date) => {
    setCompareDateOverrides(prev => ({ ...prev, [side]: date }))
  }, [])

  const handleCompareAssign = useCallback((side, tabId) => {
    if (side === 'before') setCompareAId(tabId)
    else setCompareBId(tabId)
    setCompareDateOverrides(prev => ({ ...prev, [side]: null }))
  }, [])

  // In compare mode each map writes its camera back to its own tab.
  const handleCompareMapPositionChange = useCallback((index) => (pos) => {
    const id = index === 0 ? compareTabA?.id : compareTabB?.id
    if (!id) return
    setTabs(prev => prev.map(t => (t.id === id ? { ...t, mapPosition: pos } : t)))
  }, [compareTabA?.id, compareTabB?.id])

  // ── Compare captions (per side, same editor as grid/GIF views) ──────
  const [compareCaptions, setCompareCaptions] = useState({
    before: { ...DEFAULT_CAPTION },
    after: { ...DEFAULT_CAPTION }
  })

  const handleCompareCaptionChange = useCallback((side, field, value) => {
    setCompareCaptions(prev => {
      const changes = typeof field === 'string' ? { [field]: value } : field
      return {
        ...prev,
        [side]: { ...(prev[side] || DEFAULT_CAPTION), ...changes }
      }
    })
  }, [])

  const handleCompareCaptionToggleVisible = useCallback((side) => {
    setCompareCaptions(prev => {
      const current = prev[side] || DEFAULT_CAPTION
      if (current.visible) {
        return { ...prev, [side]: { ...current, visible: false } }
      }
      // Pre-fill with the side's actual date + layer names so the user can
      // edit directly (same behaviour as the grid captions).
      const tab = side === 'before' ? effectiveCompareTabA : effectiveCompareTabB
      const date = tab?.date || ''
      const layerNames = (tab?.activeBySection?.imagery || [])
        .map(id => layerById.get(id)?.name)
        .filter(Boolean)
        .join(', ')
      const text = `${date}\n${layerNames || tab?.label || ''}`
      return { ...prev, [side]: { ...current, text, visible: true } }
    })
  }, [effectiveCompareTabA, effectiveCompareTabB, layerById])

  // The timelapse tool composites ALL active layers in the active tab, grouped
  // by section. Imagery (dated) forms the bottom, then base (dated, often
  // transparent), then reference overlays (static, TRANSPARENT=TRUE) on top.
  const tlImageryLayers = useMemo(
    () =>
      (activeTab.activeBySection?.imagery || [])
        .map(id => layerById.get(id))
        .filter(Boolean),
    [activeTab],
  )
  const tlBaseLayers = useMemo(
    () =>
      (activeTab.activeBySection?.base || [])
        .map(id => layerById.get(id))
        .filter(Boolean),
    [activeTab],
  )
  const tlReferenceLayers = useMemo(
    () =>
      (activeTab.activeBySection?.reference || [])
        .map(id => layerById.get(id))
        .filter(Boolean),
    [activeTab],
  )

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

  // Reusable "story" preset: opens a before/after Compare view for a layer
  // that declares a `storyPreset` ({ before, after } each with date/center/zoom).
  // Works for any layer — floods today, vegetation/drought tomorrow.
  const applyStoryPreset = useCallback((layer) => {
    const preset = layer?.storyPreset
    if (!preset?.before || !preset?.after) return
    const section = layerSection(layer)

    // Make sure the layer is active in the active tab's section.
    setActiveBySectionTabbed(prev => {
      if (prev[section].includes(layer.id)) return prev
      return { ...prev, [section]: [layer.id, ...prev[section]] }
    })
    setAddLayerOpen(false)

    // Build two tabs: one for "before", one for "after". Reuse existing tabs
    // when possible so we don't endlessly spawn them.
    setTabs(prev => {
      const next = [...prev]
      const makeTab = (suffix, p) => ({
        id: `preset-${layer.id}-${suffix}`,
        label: `${layer.name} — ${p.date}`,
        activeBySection: {
          base: prev[0]?.activeBySection?.base || [],
          imagery: section === 'imagery' ? [layer.id] : (prev[0]?.activeBySection?.imagery || []),
          reference: prev[0]?.activeBySection?.reference || ['Coastlines']
        },
        layerSettings: { [layer.id]: { quality: 'low', opacity: 1 } },
        hiddenLayers: new Set(),
        date: p.date,
        mapPosition: p.center ? { center: p.center, zoom: p.zoom ?? 6 } : (prev[0]?.mapPosition || { center: INITIAL_CENTER, zoom: INITIAL_ZOOM })
      })
      const before = makeTab('before', preset.before)
      const after = makeTab('after', preset.after)
      // Replace any prior preset tabs, then ensure exactly these two exist.
      const withoutPreset = next.filter(t => !t.id.startsWith(`preset-${layer.id}-`))
      return [before, after, ...withoutPreset]
    })

    // Enter compare mode with the two preset tabs.
    setCompareAId(`preset-${layer.id}-before`)
    setCompareBId(`preset-${layer.id}-after`)
    setActiveTool('compare')
    setCompareViewActive(true)
  }, [layerSection, setActiveBySectionTabbed, setTabs, setCompareAId, setCompareBId, setActiveTool, setCompareViewActive])

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
  // switches to it. Opening one panel closes the other. The compare overlay
  // stays when its panel is closed (like the grid view) and only leaves when
  // another tool is opened.
  const handleToolClick = (tool) => {
    setActiveTool(prev => (prev === tool ? null : tool))
    if (tool === 'compare') setCompareViewActive(true)
    else setCompareViewActive(false)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      // Ctrl+Shift+1 — toggle layers sidebar
      if (e.ctrlKey && e.shiftKey && e.code === 'Digit1') {
        e.preventDefault()
        setCompareViewActive(false)
        setActiveTool(prev => (prev === 'layers' ? null : 'layers'))
      }
      // Ctrl+Shift+2 — toggle timelapse tool
      if (e.ctrlKey && e.shiftKey && e.code === 'Digit2') {
        e.preventDefault()
        setCompareViewActive(false)
        setActiveTool(prev => (prev === 'timelapse' ? null : 'timelapse'))
      }
      // Ctrl+Shift+3 — toggle compare tool
      if (e.ctrlKey && e.shiftKey && e.code === 'Digit3') {
        e.preventDefault()
        setCompareViewActive(true)
        setActiveTool(prev => (prev === 'compare' ? null : 'compare'))
      }
      // Ctrl+Shift+4 — toggle layout tool
      if (e.ctrlKey && e.shiftKey && e.code === 'Digit4') {
        e.preventDefault()
        setCompareViewActive(false)
        setActiveTool(prev => (prev === 'layout' ? null : 'layout'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Explicit fetch of the union of available dates across all active imagery
  // layers + range. A date is offered if ANY imagery layer has it. Triggered
  // by the "Fetch" button, or with a one-off `range` override (e.g. the
  // initial seed from the active view). When `range` is given it takes
  // precedence over the current state values.
  const handleTlFetch = useCallback(async (range) => {
    const start = range?.startDate ?? tlStartDate
    const end = range?.endDate ?? tlEndDate
    if (activeTool !== 'timelapse' || tlImageryLayers.length === 0) return
    setTlFetching(true)
    try {
      const perLayer = await Promise.all(
        tlImageryLayers.map(l => availableDates(l.id, start, end, tlInterval)),
      )
      const union = [...new Set(perLayer.flat())].sort()
      setTlAvailableDates(union)
      setTlPreviewLimit(PREVIEW_PAGE)
      setTlSelected(new Set())
      // New date range → back to list mode; no previews until confirmed.
      setTlPreviewsConfirmed(false)
      setTlPreviewStatus(new Map())
      setTlCoverage(new Map())
      setTlPreviewBusy(false)
    } catch (err) {
      console.warn('[Timelapse] Failed to load available dates:', err)
      setTlAvailableDates([])
    } finally {
      setTlFetching(false)
    }
  }, [activeTool, tlImageryLayers, tlStartDate, tlEndDate, tlInterval])

  // Seed a default crop box the first time the timelapse tool opens, and
  // populate it from the active view: layers are already derived from the
  // active tab, so we also seed the date range from the view's date and
  // auto-fetch the available dates so the panel opens ready to use.
  const seededTlRectRef = useRef(false)
  const seedTlRectIfNeeded = useCallback((map) => {
    if (seededTlRectRef.current || !map) return
    seededTlRectRef.current = true
    const canvas = map.getCanvas()
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const cw = w * 0.7
    const ch = cw * (9 / 16)
    const sw = map.unproject([w / 2 - cw / 2, h / 2 + ch / 2])
    const ne = map.unproject([w / 2 + cw / 2, h / 2 - ch / 2])
    setTlRect([[sw.lng, sw.lat], [ne.lng, ne.lat]])
    if (activeTab?.date) {
      const start = addDaysIso(activeTab.date, -30)
      const end = activeTab.date
      setTlStartDate(start)
      setTlEndDate(end)
      handleTlFetch({ startDate: start, endDate: end })
    }
  }, [activeTab, handleTlFetch])

  // Clear the available-date list whenever the range, interval, or active
  // imagery layers change, so stale dates from a previous range aren't shown.
  // Resets the date list + previews whenever the inputs change, so stale
  // data is never shown as valid after the crop box moves or the range
  // changes. Deliberately does NOT fetch — the user triggers the fetch
  // explicitly via the "Fetch" button (see handleTlFetch / onFetch below).
  useEffect(() => {
    if (activeTool !== 'timelapse') return
    setTlAvailableDates([])
    setTlPreviewLimit(PREVIEW_PAGE)
    setTlSelected(new Set())
    setTlPreviewsConfirmed(false)
    setTlPreviewStatus(new Map())
    setTlCoverage(new Map())
    setTlPreviewBusy(false)
  }, [activeTool, tlImageryLayers, tlStartDate, tlEndDate, tlInterval, tlRect])


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
      setPaneSizes(equalPaneSizes(tabs.length))
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

  // Rename a view — the label is stored on the tab itself, so it shows up
  // everywhere the view name appears (tab bars, captions, exports...).
  const handleTabRename = useCallback((tabId, newLabel) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, label: newLabel } : t)))
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
        cells: { ...gridConfig.cells },
        captions: { ...gridConfig.captions }
      }
      setGridConfig(newConfig)
    }
  }, [gridConfig])

  const handleGridDimensionChange = useCallback((rows, cols) => {
    const newConfig = {
      rows: Math.max(1, Math.min(rows, 5)),
      cols: Math.max(1, Math.min(cols, 5)),
      width: gridConfig.width,
      height: gridConfig.height,
      cells: gridConfig.cells,
      captions: gridConfig.captions
    }
    setGridConfig(newConfig)
  }, [gridConfig])

  const handleGridSizeChange = useCallback((field, value) => {
    const next = {
      ...gridConfig,
      [field]: Math.max(field === 'width' ? 320 : 240, Math.round(Number(value) || 0))
    }
    setGridConfig(next)
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
  }, [gridConfig])

  const handleCellSpanChange = useCallback((cellIndex, rowSpan, colSpan) => {
    const newCells = { ...gridConfig.cells }
    if (newCells[cellIndex]) {
      newCells[cellIndex] = { ...newCells[cellIndex], rowSpan, colSpan }
      const newConfig = { ...gridConfig, cells: newCells }
      setGridConfig(newConfig)
    }
  }, [gridConfig])

  const handleClearCell = useCallback((cellIndex) => {
    const newCells = { ...gridConfig.cells }
    delete newCells[cellIndex]
    const newConfig = { ...gridConfig, cells: newCells }
    setGridConfig(newConfig)
    setSelectedCell(null)
  }, [gridConfig])

  // ── Caption handlers ──────────────────────────────────────────────────
  const handleCaptionChange = useCallback((cellIndex, field, value) => {
    const newCaptions = { ...gridConfig.captions }
    const changes = typeof field === 'string' ? { [field]: value } : field
    newCaptions[cellIndex] = { ...(newCaptions[cellIndex] || DEFAULT_CAPTION), ...changes }
    const newConfig = { ...gridConfig, captions: newCaptions }
    setGridConfig(newConfig)
  }, [gridConfig])

  const handleCaptionToggleVisible = useCallback((cellIndex) => {
    const current = gridConfig.captions[cellIndex] || DEFAULT_CAPTION
    const turningOn = !current.visible

    if (turningOn) {
      // Pre-fill the text with the actual date + layer names (instead of
      // %date%/%layer% placeholders) so the user can edit it directly.
      const hasCustomText = gridConfig.captions[cellIndex] &&
        gridConfig.captions[cellIndex].text !== DEFAULT_CAPTION.text
      if (!hasCustomText) {
        const tabId = gridConfig.cells[cellIndex]?.tabId
        const tab = tabs.find(t => t.id === tabId)
        const date = tab?.date || ''
        const layerNames = (tab?.activeBySection?.imagery || [])
          .map(id => layerById.get(id)?.name).filter(Boolean).join(', ')
        const text = `${date}\n${layerNames || tab?.label || ''}`
        const newCaptions = { ...gridConfig.captions }
        newCaptions[cellIndex] = { ...(newCaptions[cellIndex] || DEFAULT_CAPTION), text, visible: true }
        const newConfig = { ...gridConfig, captions: newCaptions }
        setGridConfig(newConfig)
        return
      }
    }

    handleCaptionChange(cellIndex, 'visible', !current.visible)
  }, [gridConfig, tabs, layerById, handleCaptionChange])

  // ── Map instance tracking for export ──────────────────────────────────
  const mapInstancesRef = useRef({}) // { tabId: mapInstance }

  const trackMapInstance = useCallback((tabId, map) => {
    if (map) mapInstancesRef.current[tabId] = map
  }, [])

  // Fly the active view's map to a searched place (Nominatim result).
  const handleSearchSelect = useCallback((lat, lon) => {
    const map = mapInstancesRef.current[activeTabId]
    if (map) map.flyTo({ center: [lon, lat], zoom: 12 })
  }, [activeTabId])

  // ── Timelapse tool handlers ─────────────────────────────────────────
  const handleTlApplyPreset = useCallback((ratio) => {
    const map = mapInstancesRef.current[activeTabId]
    if (!map) return
    const canvas = map.getCanvas()
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const base = Math.min(w, h) * 0.75
    let rw, rh
    if (ratio === 16 / 9) {
      rw = base
      rh = rw * (9 / 16)
      if (rh > h * 0.85) { rh = h * 0.85; rw = rh * (16 / 9) }
    } else if (ratio === 1) {
      rw = rh = base
    } else {
      rw = w * 0.7
      rh = h * 0.7
    }
    const sw = map.unproject([w / 2 - rw / 2, h / 2 + rh / 2])
    const ne = map.unproject([w / 2 + rw / 2, h / 2 - rh / 2])
    setTlRect([[sw.lng, sw.lat], [ne.lng, ne.lat]])
    setTlAspect(typeof ratio === 'number' ? ratio : null)
  }, [activeTabId])

  const handleTlResetRect = useCallback(() => {
    const map = mapInstancesRef.current[activeTabId]
    if (!map) return
    const canvas = map.getCanvas()
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const ar = tlAspect || 16 / 9
    let cw = w * 0.7
    let ch = cw / ar
    if (ch > h * 0.7) { ch = h * 0.7; cw = ch * ar }
    const sw = map.unproject([w / 2 - cw / 2, h / 2 + ch / 2])
    const ne = map.unproject([w / 2 + cw / 2, h / 2 - ch / 2])
    setTlRect([[sw.lng, sw.lat], [ne.lng, ne.lat]])
  }, [activeTabId, tlAspect])

  const handleTlToggleSelect = useCallback((date) => {
    setTlSelected(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }, [])

  const handleTlSelectVisible = useCallback(() => {
    const visible = tlAvailableDates.slice(0, tlPreviewLimit)
    if (!visible.length) return
    setTlSelected(prev => {
      const next = new Set(prev)
      const allSelected = visible.every(d => next.has(d))
      visible.forEach(d => (allSelected ? next.delete(d) : next.add(d)))
      return next
    })
  }, [tlAvailableDates, tlPreviewLimit])

  const handleTlAddSelected = useCallback(() => {
    if (!tlSelected.size) return
    setTlFrames(prev => {
      const existing = new Set(prev.map(f => f.time))
      const additions = [...tlSelected]
        .sort()
        .filter(t => !existing.has(t))
        .map(t => ({ time: t, label: t, delay: DEFAULT_FRAME_DELAY }))
      return additions.length ? [...prev, ...additions] : prev
    })
    setTlSelected(new Set())
  }, [tlSelected])

  const handleTlLoadMore = useCallback(() => {
    setTlPreviewLimit(prev => prev + PREVIEW_PAGE)
  }, [])

  const handleTlClearSelection = useCallback(() => {
    setTlSelected(new Set())
  }, [])

  const handleTlBackToList = useCallback(() => {
    setTlPreviewsConfirmed(false)
  }, [])

  // Explicit confirmation: only now do we fetch anything. Each selected date
  // is probed with a tiny 16×16 PNG (lightweight) for EVERY active imagery
  // layer; dates where no imagery layer has data in the crop are skipped.
  // Probes run 4-at-a-time. Per-layer coverage is recorded for the browser.
  const handleTlLoadPreviews = useCallback(async () => {
    if (tlImageryLayers.length === 0 || !tlRect || tlPreviewBusy) return
    const dates = [...tlSelected].sort()
    if (!dates.length) return
    const bbox = rectToBbox3857(tlRect)
    setTlPreviewsConfirmed(true)
    setTlPreviewBusy(true)
    setTlPreviewStatus(new Map(dates.map(d => [d, 'loading'])))
    setTlCoverage(new Map(dates.map(d => [d, new Map(tlImageryLayers.map(l => [l.id, false]))])))
    try {
      await runPool(dates, async (date) => {
        const cov = new Map(tlImageryLayers.map(l => [l.id, false]))
        let anyOk = false
        await runPool(tlImageryLayers, async (layer) => {
          try {
            const has = await probeHasData(wmsBaseUrl, layer, bbox, date)
            cov.set(layer.id, has)
            if (has) anyOk = true
          } catch {
            cov.set(layer.id, false)
          }
        })
        setTlCoverage(prev => new Map(prev).set(date, cov))
        setTlPreviewStatus(prev =>
          new Map(prev).set(date, anyOk ? 'ok' : 'empty'),
        )
      })
    } finally {
      setTlPreviewBusy(false)
    }
  }, [tlImageryLayers, tlRect, tlSelected, tlPreviewBusy, wmsBaseUrl])

  const handleTlRemoveFrame = useCallback((index) => {
    const removed = tlFrames[index]
    if (removed && removed.time === tlEditFrameTime) setTlEditFrameTime(null)
    setTlFrames(prev => prev.filter((_, i) => i !== index))
  }, [tlFrames, tlEditFrameTime])

  const handleTlClearFrames = useCallback(() => {
    setTlFrames([])
    setTlEditFrameTime(null)
  }, [])

  const handleTlReorderFrames = useCallback((next) => {
    setTlFrames(next)
  }, [])

  // Selecting a frame in the sidebar opens its caption/delay editor.
  const handleTlSelectFrame = useCallback((time) => {
    setTlEditFrameTime(prev => (prev === time ? null : time))
  }, [])

  // Patch a frame's caption (creates one with grid-defaults on first edit).
  const handleTlCaptionChange = useCallback((time, patch) => {
    setTlFrames(prev => prev.map(f => {
      if (f.time !== time) return f
      const base = f.caption || {
        text: '',
        position: 'bottom-left',
        overlayColor: '#000000',
        overlayOpacity: 0.55,
        textColor: '#ffffff',
        fontSize: 11,
        visible: true,
      }
      return { ...f, caption: { ...base, ...patch } }
    }))
  }, [])

  // Per-frame delay override (seconds); empty/invalid falls back to the default.
  const handleTlFrameDelayChange = useCallback((time, delay) => {
    const value = delay == null || !Number.isFinite(delay) || delay <= 0 ? DEFAULT_FRAME_DELAY : delay
    setTlFrames(prev => prev.map(f => (f.time === time ? { ...f, delay: value } : f)))
  }, [])

  const handleTimelapseExport = useCallback(async () => {
    if (!tlRect || tlFrames.length < 2 || tlImageryLayers.length === 0 || tlExporting) return
    setTlExporting(true)
    setTlProgress(null)
    try {
      const bbox3857 = rectToBbox3857(tlRect)
      const [minX, minY, maxX, maxY] = bbox3857
      const aspect = (maxX - minX) / Math.max(1e-6, maxY - minY)
      let width = 800
      let height = Math.max(1, Math.round(width / aspect))
      if (width > GIF_MAX_WIDTH) {
        width = GIF_MAX_WIDTH
        height = Math.max(1, Math.round(width / aspect))
      }
      // Stack every active layer for the composite GIF: imagery + base first
      // (dated), then reference overlays (static, drawn on top).
      const exportLayers = [
        ...tlImageryLayers,
        ...tlBaseLayers,
        ...tlReferenceLayers,
      ].map(layer => ({ layer, role: layerSection(layer) }))
      const blob = await renderTimelapseGif({
        frames: tlFrames.map(f => ({
          time: f.time,
          label: f.label,
          caption: f.caption,
          delayMs: (f.delay ?? DEFAULT_FRAME_DELAY) * 1000,
        })),
        layers: exportLayers,
        bbox3857,
        width,
        height,
        stampDates: tlStampDates,
        wmsBaseUrl,
        onProgress: (done, total) => setTlProgress({ done, total }),
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `gibson-timelapse-${tlStartDate}-to-${tlEndDate}.gif`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[Timelapse] Export failed:', err)
      window.alert(`Timelapse export failed: ${err.message || err}`)
    } finally {
      setTlExporting(false)
      setTlProgress(null)
    }
  }, [tlRect, tlFrames, tlImageryLayers, tlBaseLayers, tlReferenceLayers, tlExporting, tlStampDates, wmsBaseUrl, tlStartDate, tlEndDate])

  const resolveTemplate = (text, date, layerName) =>
    text.replace(/%date%/g, date).replace(/%layer%/g, layerName)

  const drawCaption = (ctx, caption, text, x, y, width, height) => {
    if (!caption?.visible || !caption?.text) return
    const lines = resolveTemplate(caption.text, text.date, text.layerName).split('\n')
    const pad = Math.round((caption.fontSize || 12) * 0.66)
    const fontSize = caption.fontSize || 12
    const lineHeight = Math.round(fontSize * 1.3)
    ctx.font = `${fontSize}px monospace`
    const blockW = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2
    const blockH = lines.length * lineHeight + pad * 2

    let bx, by
    switch (caption.position) {
      case 'top-right': bx = x + width - blockW - pad; by = y + pad; break
      case 'top-left': bx = x + pad; by = y + pad; break
      case 'bottom-right': bx = x + width - blockW - pad; by = y + height - blockH - pad; break
      default: bx = x + pad; by = y + height - blockH - pad; break
    }

    const overlayColor = caption.overlayColor || '#000000'
    ctx.fillStyle = overlayColor
    ctx.globalAlpha = overlayColor.length === 9 ? 1 : caption.overlayOpacity ?? 0.55
    ctx.fillRect(bx, by, blockW, blockH)
    ctx.globalAlpha = 1
    ctx.fillStyle = caption.textColor || '#ffffff'
    lines.forEach((line, i) => {
      ctx.fillText(line, bx + pad, by + pad + (i + 1) * lineHeight)
    })
  }

  const drawMapToCanvas = (map, targetCtx, x, y, w, h) => {
    const source = map.getCanvas()
    const gl = source.getContext('webgl2') || source.getContext('webgl')
    if (!gl) return Promise.resolve()

    map.triggerRepaint()
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        const width = source.width
        const height = source.height
        const pixels = new Uint8Array(width * height * 4)
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

        const image = targetCtx.createImageData(width, height)
        for (let row = 0; row < height; row++) {
          const sourceOffset = (height - row - 1) * width * 4
          image.data.set(pixels.subarray(sourceOffset, sourceOffset + width * 4), row * width * 4)
        }

        const snapshot = document.createElement('canvas')
        snapshot.width = width
        snapshot.height = height
        snapshot.getContext('2d').putImageData(image, 0, 0)
        targetCtx.drawImage(snapshot, x, y, w, h)
        resolve()
      })
    })
  }

  const handleExportTab = useCallback((tabId) => {
    const map = mapInstancesRef.current[tabId]
    if (!map) return
    const tab = tabs.find(t => t.id === tabId)
    const srcCanvas = map.getCanvas()
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = srcCanvas.width
    exportCanvas.height = srcCanvas.height
    const ctx = exportCanvas.getContext('2d')

    drawMapToCanvas(map, ctx, 0, 0, exportCanvas.width, exportCanvas.height).then(() => {

    // Draw caption if present
    const cellIndex = Object.keys(gridConfig.cells).find(
      k => gridConfig.cells[k]?.tabId === tabId
    )
    if (cellIndex !== undefined) {
      const caption = gridConfig.captions?.[cellIndex]
      const layerNames = (tab?.activeBySection?.imagery || [])
        .map(id => layerById.get(id)?.name).filter(Boolean).join(', ')
      drawCaption(ctx, caption, { date: tab?.date || '', layerName: layerNames || tab?.label || '' }, 0, 0, exportCanvas.width, exportCanvas.height)
    }

      const dateStr = (tab?.date || '').replace(/-/g, '')
      exportCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `gibson-${tabId}-${dateStr}.jpg`
        link.click()
        URL.revokeObjectURL(url)
      }, 'image/jpeg', 0.95)
    })
  }, [tabs, gridConfig, layerById])

  const handleExportGrid = useCallback(() => {
    const cells = gridConfig.cells
    if (!cells || Object.keys(cells).length === 0) return
    const containerEl = gridContainerRef.current
    if (!containerEl) return

    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = gridConfig.width
    exportCanvas.height = gridConfig.height
    const ctx = exportCanvas.getContext('2d')

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)

    // Derive each cell's target rect from the actual rendered DOM geometry (not naive fractions)
    // so gaps/padding/borders and row/col spans are captured exactly as shown on screen.
    const containerRect = containerEl.getBoundingClientRect()
    const scaleX = exportCanvas.width / containerRect.width
    const scaleY = exportCanvas.height / containerRect.height

    const drawOps = []
    Object.entries(cells).forEach(([cellIndex, cellData]) => {
      const map = mapInstancesRef.current[cellData.tabId]
      if (!map) return
      const cellEl = containerEl.querySelector(`[data-cell-index="${cellIndex}"]`)
      if (!cellEl) return // not currently placed in the grid

      const cellRect = cellEl.getBoundingClientRect()
      const x = (cellRect.left - containerRect.left) * scaleX
      const y = (cellRect.top - containerRect.top) * scaleY
      const w = cellRect.width * scaleX
      const h = cellRect.height * scaleY

      drawOps.push({ map, x, y, w, h, cellIndex, cellData })
    })

    const drawNext = (index) => {
      if (index >= drawOps.length) {
        drawOps.forEach(({ x, y, w, h, cellIndex, cellData }) => {
          ctx.strokeStyle = '#333'
          ctx.lineWidth = 2
          ctx.strokeRect(x, y, w, h)
          const tab = tabs.find(t => t.id === cellData.tabId)
          const caption = gridConfig.captions?.[cellIndex]
          if (caption?.visible) {
            const layerNames = (tab?.activeBySection?.imagery || [])
              .map(id => layerById.get(id)?.name).filter(Boolean).join(', ')
            drawCaption(ctx, caption, { date: tab?.date || '', layerName: layerNames || tab?.label || '' }, x, y, w, h)
          }
        })
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        exportCanvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `gibson-grid-${dateStr}.jpg`
          link.click()
          URL.revokeObjectURL(url)
        }, 'image/jpeg', 0.95)
        return
      }
      const { map, x, y, w, h } = drawOps[index]
      drawMapToCanvas(map, ctx, x, y, w, h).then(() => drawNext(index + 1))
    }
    drawNext(0)
  }, [gridConfig, tabs, layerById])

  // ── Project file (the only save/share mechanism) ────────────────────
  const handleSaveProject = useCallback(() => {
    const timelapse = { tlStartDate, tlEndDate, tlInterval, tlAspect, tlRect, tlStampDates, tlFrames }
    const project = serializeProject({ tabs, gridConfig, compareCaptions, activeTabId, timelapse })
    downloadProjectFile(project)
  }, [tabs, gridConfig, compareCaptions, activeTabId, tlStartDate, tlEndDate, tlInterval, tlAspect, tlRect, tlStampDates, tlFrames])

  // Load a project file into the app. Returns true on success so the
  // sidebar can surface a "couldn't read that file" message.
  const handleLoadProject = useCallback((jsonText) => {
    const state = deserializeProject(jsonText)
    if (!state) return false
    setTabs(state.tabs)
    setActiveTabId(state.activeTabId)
    setGridConfig(state.gridConfig)
    if (state.compareCaptions) setCompareCaptions(state.compareCaptions)
    if (state.timelapse) {
      const tl = state.timelapse
      if (tl.tlStartDate) setTlStartDate(tl.tlStartDate)
      if (tl.tlEndDate) setTlEndDate(tl.tlEndDate)
      if (tl.tlInterval) setTlInterval(tl.tlInterval)
      if (tl.tlAspect !== undefined) setTlAspect(tl.tlAspect)
      if (tl.tlRect) setTlRect(tl.tlRect)
      if (tl.tlStampDates !== undefined) setTlStampDates(tl.tlStampDates)
      if (tl.tlFrames) setTlFrames(tl.tlFrames)
    }
    setSelectedCell(null)
    return true
  }, [])

  // ── Reset everything ──────────────────────────────────────────────────
  // Flush the saved views, then reload — the app boots back to fresh
  // defaults with no stale map/grid/timelapse state left behind.
  const handleResetAll = useCallback(() => {
    if (!window.confirm(
      'Reset everything?\n\n' +
      'This clears all saved views, layers, grid layouts, compare settings and timelapse state. ' +
      'This cannot be undone.'
    )) return
    try {
      localStorage.removeItem(AUTOSAVE_KEY)      // gibson-app-state
      localStorage.removeItem('gibson-grid-config')  // legacy — no longer written
      localStorage.removeItem('gibson-pane-sizes')   // legacy — no longer written
      localStorage.removeItem('gibson-pane-layout')  // legacy layout storage
      localStorage.removeItem('gibson-project-url')  // (reserved)
    } catch (e) {
      console.error('Failed to clear saved state:', e)
    }
    window.location.reload()
  }, [])

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
      {/* Timelapse workbench — crop box on the map + image browser */}
      {activeTool === 'timelapse' && activeTab && (
        <div className="timelapse-layout">
          <TimelapsePanel
            layerSummary={tlImageryLayers.map(l => l.name).join(' + ') || ''}
            hasLayers={tlImageryLayers.length > 0}
            startDate={tlStartDate}
            endDate={tlEndDate}
            onStartDateChange={setTlStartDate}
            onEndDateChange={setTlEndDate}
            interval={tlInterval}
            onIntervalChange={setTlInterval}
            aspect={tlAspect}
            onApplyPreset={handleTlApplyPreset}
            onResetRect={handleTlResetRect}
            hasRect={!!tlRect}
            rect={tlRect}
            availableCount={tlAvailableDates.length}
            frames={tlFrames}
            onRemoveFrame={handleTlRemoveFrame}
            onRemoveAllFrames={handleTlClearFrames}
            onReorderFrames={handleTlReorderFrames}
            selectedFrameTime={tlEditFrameTime}
            onSelectFrame={handleTlSelectFrame}
            onCaptionChange={handleTlCaptionChange}
            onFrameDelayChange={handleTlFrameDelayChange}
            defaultDelay={DEFAULT_FRAME_DELAY}
            stampDates={tlStampDates}
            onStampDatesChange={setTlStampDates}
            exporting={tlExporting}
            progress={tlProgress}
            onExport={handleTimelapseExport}
            onClose={() => setActiveTool(null)}
          />
          <div className="timelapse-workbench">
            <div className="timelapse-map-pane">
              <MapInstance
                tab={activeTab}
                layerById={layerById}
                layerCatalog={layerCatalog}
                wmtsBaseUrl={wmtsBaseUrl}
                mapSettings={mapSettings}
                onMapReady={(map) => {
                  trackMapInstance(activeTab.id, map)
                  seedTlRectIfNeeded(map)
                }}
                onMapPositionChange={handleMapPositionChange}
                selectionMode
                selectionRect={tlRect}
                onSelectionChange={setTlRect}
              />
            </div>
            <TimelapseBrowser
              layerName={tlImageryLayers.map(l => l.name).join(' + ') || ''}
              hasRect={!!tlRect}
              bbox3857={tlRect ? rectToBbox3857(tlRect) : null}
              wmsBaseUrl={wmsBaseUrl}
              layers={[
                ...tlImageryLayers,
                ...tlBaseLayers,
                ...tlReferenceLayers,
              ].map(layer => ({ layer, role: layerSection(layer) }))}
              dates={tlAvailableDates}
              limit={tlPreviewLimit}
              selected={tlSelected}
              status={tlPreviewStatus}
              coverage={tlCoverage}
              busy={tlPreviewBusy}
              confirmed={tlPreviewsConfirmed}
              fetching={tlFetching}
              onToggleSelect={handleTlToggleSelect}
              onSelectVisible={handleTlSelectVisible}
              onClearSelection={handleTlClearSelection}
              onAddSelected={handleTlAddSelected}
              onLoadMore={handleTlLoadMore}
              onConfirm={handleTlLoadPreviews}
              onBackToList={handleTlBackToList}
              onFetch={handleTlFetch}
            />
          </div>
        </div>
      )}

      {/* Compare workbench — two views overlaid with a draggable slider */}
      {compareViewActive && compareTabA && compareTabB && (
        <div className="compare-layout">
          {activeTool === 'compare' && (
          <ComparePanel
            tabs={tabs}
            compareAId={compareTabA.id}
            compareBId={compareTabB.id}
            onCompareAChange={(id) => handleCompareAssign('before', id)}
            onCompareBChange={(id) => handleCompareAssign('after', id)}
            onSwap={() => {
              setCompareAId(compareTabB.id)
              setCompareBId(compareTabA.id)
              setCompareDateOverrides(prev => ({ before: prev.after, after: prev.before }))
            }}
            onClose={() => setActiveTool(null)}
            captions={compareCaptions}
            onCaptionChange={handleCompareCaptionChange}
            onCaptionToggleVisible={handleCompareCaptionToggleVisible}
            defaultCaption={DEFAULT_CAPTION}
            dateOverrides={compareDateOverrides}
            onDateChange={handleCompareDateChange}
            layerById={layerById}
          />
          )}
          <div className="compare-workbench">
            <CompareOverlay
              tabA={effectiveCompareTabA}
              tabB={effectiveCompareTabB}
              layerById={layerById}
              layerCatalog={layerCatalog}
              wmtsBaseUrl={wmtsBaseUrl}
              mapSettings={mapSettings}
              captions={compareCaptions}
              anchorPosition={activeTab?.mapPosition}
              onMapReady={(index, map) => trackMapInstance(index === 0 ? compareTabA.id : compareTabB.id, map)}
              onMapPositionChange={handleCompareMapPositionChange}
            />
          </div>
        </div>
      )}

      {/* Main view — grid layout or single active tab */}
      {activeTool !== 'timelapse' && !compareViewActive && gridViewActive && gridConfig.rows > 0 && gridConfig.cols > 0 && (
        <div className="globe-grid-view" ref={gridViewWrapRef}>
          <div className="globe-grid-container" ref={gridContainerRef} style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
            gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
            gap: '3px',
            width: `${gridConfig.width * gridScale}px`,
            height: `${gridConfig.height * gridScale}px`,
            overflow: 'hidden',
            background: '#000'
          }}>
            {Array.from({ length: gridConfig.rows * gridConfig.cols }).map((_, cellIndex) => {
              const cellData = gridConfig.cells[cellIndex]
              const pos = gridPlacement[cellIndex]
              // Skip cells that would land in an implicit row/col outside the grid
              if (!pos) return null
              const rowSpan = cellData?.rowSpan || 1
              const colSpan = cellData?.colSpan || 1
              if (!cellData) {
                return (
                  <div key={cellIndex} className="globe-grid-cell globe-grid-cell--empty" data-cell-index={cellIndex} style={{
                    gridRow: `${pos.row + 1} / span ${rowSpan}`,
                    gridColumn: `${pos.col + 1} / span ${colSpan}`,
                  }}>
                    <div className="globe-grid-empty">Empty</div>
                  </div>
                )
              }
              const tab = tabs.find(t => t.id === cellData.tabId)
              const caption = gridConfig.captions[cellIndex]
              const resolvedText = caption?.visible && caption?.text
                ? caption.text
                    .replace(/%date%/g, tab?.date || '')
                    .replace(/%layer%/g, tab?.layer?.name || tab?.label || '')
                : null
              const captionLines = resolvedText ? resolvedText.split('\n') : []
              const posClass = caption?.position || 'bottom-left'
              return (
                <div key={cellIndex} className="globe-grid-cell" data-cell-index={cellIndex} style={{
                  gridRow: `${pos.row + 1} / span ${rowSpan}`,
                  gridColumn: `${pos.col + 1} / span ${colSpan}`,
                }}>
                  {tab ? (
                    <MapInstance
                      tab={tab}
                      layerById={layerById}
                      layerCatalog={layerCatalog}
                      wmtsBaseUrl={wmtsBaseUrl}
                      mapSettings={mapSettings}
                      onMapReady={(map) => trackMapInstance(tab.id, map)}
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
                          opacity: caption.overlayColor?.length === 9 ? 1 : caption.overlayOpacity ?? 0.55,
                        }}
                      />
                      <div className="globe-grid-caption-text" style={{ color: caption.textColor || '#fff', fontSize: `${caption.fontSize || 12}px`, lineHeight: 1.3 }}>
                        {captionLines.map((line, li) => (
                          <div key={li}>{line}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {tab && (
                    <button
                      type="button"
                      className="globe-grid-cell-info"
                      title={cellLayerNames(tab)}
                    >
                      <Icon icon="fluent:info-16-regular" width="12" height="12" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Single view */}
      {activeTool !== 'timelapse' && !compareViewActive && !gridViewActive && activeTab && (
        <div className="globe-single-view" data-tour="map-single">
          <MapInstance
            tab={activeTab}
            layerById={layerById}
            layerCatalog={layerCatalog}
            wmtsBaseUrl={wmtsBaseUrl}
            mapSettings={mapSettings}
            onMapReady={(map) => trackMapInstance(activeTab.id, map)}
            onMapPositionChange={handleMapPositionChange}
          />
        </div>
      )}

      <SideToolbar
        activeTool={activeTool}
        onToolClick={handleToolClick}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        onResetAll={handleResetAll}
        onLogoClick={() => setWelcomeOpen(true)}
      />
      {activeTool !== 'timelapse' && activeTool !== 'compare' && activeTool !== 'layout' && (
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
        onTabRename={handleTabRename}
        activeTabDate={activeTab.date}
        onTabDateChange={handleTabDateChange}
        onSearchSelect={handleSearchSelect}
      />
      )}
      {activeTool === 'layout' && (
      <LayoutSidebar
        open
        onClose={() => setActiveTool(null)}
        tabs={tabs}
        gridConfig={gridConfig}
        selectedCell={selectedCell}
        onCellSelect={setSelectedCell}
        onPresetSelect={handleGridPresetApply}
        onDimensionChange={handleGridDimensionChange}
        onGridSizeChange={handleGridSizeChange}
        onCellSpanChange={handleCellSpanChange}
        onAssignView={handleAssignViewToCell}
        onClearCell={handleClearCell}
        gridPlacement={gridPlacement}
        onCaptionChange={handleCaptionChange}
        onCaptionToggleVisible={handleCaptionToggleVisible}
        defaultCaption={DEFAULT_CAPTION}
        captionPositions={CAPTION_POSITIONS}
        onExportGrid={handleExportGrid}
      />
      )}
      <AddLayerModal
        catalog={layerCatalog}
        categories={layersConfig.categories || {}}
        activeLayers={flattenActive(activeBySection)}
        onAdd={addLayer}
        onRemove={removeLayer}
        open={addLayerOpen}
        onClose={() => setAddLayerOpen(false)}
        selectedDate={activeTab.date}
        onApplyStoryPreset={applyStoryPreset}
      />

      {/* Welcome / about — first load, or when the logo is clicked */}
      <WelcomeModal
        isOpen={welcomeOpen}
        onClose={closeWelcome}
        onStartTour={startTour}
      />

      {/* Guided tour — highlights toolbar buttons and the map */}
      <TutorialTour
        run={tourRunning}
        onFinish={() => setTourRunning(false)}
      />

      {showRestoreToast && (
        <Toast
          message="Restored your previous session from this browser."
          actionLabel="Reset"
          onAction={handleResetAll}
          onDismiss={() => setShowRestoreToast(false)}
        />
      )}

    </div>
  )
}
