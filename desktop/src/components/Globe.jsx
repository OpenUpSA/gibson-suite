import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './Globe.css'
import SideToolbar from './SideToolbar'
import Sidebar from './Sidebar'
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

export default function Globe() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [activeBySection, setActiveBySection] = useState(initialBySection)
  const [layerSettings, setLayerSettings] = useState(initialSettings)
  const [hiddenLayers, setHiddenLayers] = useState(new Set())
  const [activeTool, setActiveTool] = useState('layers') // 'layers' | null
  const [addLayerOpen, setAddLayerOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(defaultDate)

  // Refs mirror state so the map 'load' handler and effects read fresh values.
  // activeRef holds the flattened ordered list (index 0 = top) used by the map.
  const activeRef = useRef(flattenActive(activeBySection))
  const settingsRef = useRef(layerSettings)
  const hiddenRef = useRef(hiddenLayers)
  const readyRef = useRef(false)
  const prevActiveRef = useRef(flattenActive(activeBySection))
  const prevSettingsRef = useRef(layerSettings)
  activeRef.current = flattenActive(activeBySection)
  settingsRef.current = layerSettings
  hiddenRef.current = hiddenLayers

  // Add a single layer (source + layer) to the map.
  // When immediate=false (default), waits for tiles then fades in.
  const addLayerToMap = useCallback((id, { immediate = false } = {}) => {
    const map = mapRef.current
    const layer = layerById.get(id)
    if (!map || !layer) return
    const srcId = layerSrcMapRef.current[id] || `layer-${id}`
    const s = settingsRef.current[id] ?? DEFAULT_SETTINGS(layer)
    const targetOpacity = hiddenRef.current.has(id) ? 0 : s.opacity

    // If source already exists (e.g. fading-out), cancel pending removal
    // and fade back in from wherever the opacity is now.
    if (map.getSource(srcId)) {
      if (transitionsRef.current[id]) {
        if (transitionsRef.current[id].cleanup) transitionsRef.current[id].cleanup()
        delete transitionsRef.current[id]
      }
      map.setPaintProperty(srcId, 'raster-opacity-transition', { duration: 600, delay: 0 })
      map.setPaintProperty(srcId, 'raster-opacity', targetOpacity)
      return
    }

    const url = buildTileUrlTemplate({ wmtsBaseUrl }, layer, layerTime(layer, selectedDate))
    map.addSource(srcId, rasterSource([url], QUALITY_MAXZOOM[s.quality]))
    map.addLayer({
      id: srcId,
      type: 'raster',
      source: srcId,
      paint: {
        'raster-opacity': immediate ? targetOpacity : 0,
        'raster-opacity-transition': { duration: 600, delay: 0 }
      }
    })

    if (immediate || targetOpacity <= 0) return

    // Fade in slowly — even if tiles aren't ready, the old layer (underneath)
    // stays visible. As new tiles arrive, they become visible through the
    // gradually-increasing opacity.
    setTimeout(() => {
      delete transitionsRef.current[id]
      try {
        map.setPaintProperty(srcId, 'raster-opacity', targetOpacity)
      } catch {}
    }, 300)
    transitionsRef.current[id] = { cleanup: () => {} }
  }, [selectedDate])

  // Remove a single layer (source + layer) from the map.
  // Fades out via MapLibre's transition, then removes.
  const removeLayerFromMap = useCallback((id) => {
    const map = mapRef.current
    if (!map) return
    const srcId = layerSrcMapRef.current[id] || `layer-${id}`
    if (!map.getLayer(srcId)) {
      delete layerSrcMapRef.current[id]
      return
    }

    // Cancel any pending fade-in
    if (transitionsRef.current[id]) {
      if (transitionsRef.current[id].cleanup) transitionsRef.current[id].cleanup()
      delete transitionsRef.current[id]
    }

    const curOpacity = map.getPaintProperty(srcId, 'raster-opacity') || 0
    if (curOpacity <= 0.01) {
      // Already invisible — remove immediately
      try {
        map.removeLayer(srcId)
        if (map.getSource(srcId)) map.removeSource(srcId)
      } catch {}
      delete layerSrcMapRef.current[id]
      return
    }

    // Fade out via MapLibre's built-in transition, then remove after it completes.
    const duration = 400
    let cancelled = false
    const cleanup = () => { cancelled = true; clearTimeout(timeoutId) }
    try {
      map.setPaintProperty(srcId, 'raster-opacity-transition', { duration, delay: 0 })
      map.setPaintProperty(srcId, 'raster-opacity', 0)
    } catch {
      try {
        map.removeLayer(srcId)
        if (map.getSource(srcId)) map.removeSource(srcId)
      } catch {}
      delete layerSrcMapRef.current[id]
      return
    }
    const timeoutId = setTimeout(() => {
      if (cancelled) return
      // Only remove if this srcId is still the canonical one (not re-added)
      if (layerSrcMapRef.current[id] === srcId) {
        try {
          if (map.getLayer(srcId)) map.removeLayer(srcId)
          if (map.getSource(srcId)) map.removeSource(srcId)
        } catch {}
        delete layerSrcMapRef.current[id]
      }
    }, duration + 100)
    transitionsRef.current[id] = { cleanup }
  }, [])

  // Normalize stacking so index 0 (top of list) renders on top, without
  // rebuilding any sources — moves each layer to the top in reverse order.
  const applyOrder = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    for (const id of [...activeRef.current].reverse()) {
      const srcId = layerSrcMapRef.current[id] || `layer-${id}`
      if (map.getLayer(srcId)) map.moveLayer(srcId)
    }
  }, [])

  // Rebuild a single layer's source (needed when its resolution changes —
  // source maxzoom is fixed at creation). Crossfades old → new in place,
  // matching the legacy Map.jsx sourcedata → idle → transition pattern.
  const rebuildLayer = useCallback((id) => {
    const map = mapRef.current
    const layer = layerById.get(id)
    if (!map || !layer) return
    const oldSrcId = layerSrcMapRef.current[id] || `layer-${id}`

    // Cancel any in-progress transition
    if (transitionsRef.current[id]) {
      if (transitionsRef.current[id].cleanup) transitionsRef.current[id].cleanup()
      delete transitionsRef.current[id]
    }

    const s = settingsRef.current[id] ?? DEFAULT_SETTINGS(layer)
    const targetOpacity = hiddenRef.current.has(id) ? 0 : s.opacity

    if (!map.getLayer(oldSrcId)) {
      addLayerToMap(id, { immediate: true })
      applyOrder()
      return
    }

    const newSrcId = `layer-${id}-v${Date.now()}`
    const url = buildTileUrlTemplate({ wmtsBaseUrl }, layer, layerTime(layer, selectedDate))
    const maxZoom = QUALITY_MAXZOOM[s.quality]

    // Add new source + layer on top of old. The old layer STAYS at full
    // opacity (never faded out) — only the new layer fades in. This
    // guarantees no black screen even if tiles take seconds to load.
    map.addSource(newSrcId, rasterSource([url], maxZoom))
    map.addLayer({
      id: newSrcId,
      type: 'raster',
      source: newSrcId,
      paint: {
        'raster-opacity': 0,
        'raster-opacity-transition': { duration: 1500, delay: 0 }
      }
    })

    // Start fade-in immediately. Old layer stays fully visible underneath.
    setTimeout(() => {
      delete transitionsRef.current[id]
      try {
        map.setPaintProperty(newSrcId, 'raster-opacity', targetOpacity)
      } catch {}
    }, 300)

    // Remove old layer AFTER a long delay (3s) to give tiles plenty of time.
    setTimeout(() => {
      if (layerSrcMapRef.current[id] === newSrcId) {
        try {
          if (map.getLayer(oldSrcId)) map.removeLayer(oldSrcId)
          if (map.getSource(oldSrcId)) map.removeSource(oldSrcId)
        } catch {}
      }
    }, 3000)
    transitionsRef.current[id] = { cleanup: () => {} }
  }, [selectedDate, addLayerToMap, applyOrder])

  // Initial build — called once when the style loads.
  // Layers are added at opacity 0 and fade in together.
  const buildAllLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    for (const srcId of Object.keys(map.getStyle().sources || {}).filter(id => id.startsWith('layer-'))) {
      try { map.removeLayer(srcId); map.removeSource(srcId) } catch {}
    }
    layerSrcMapRef.current = {}
    for (const id of [...activeRef.current].reverse()) {
      const canonicalId = `layer-${id}`
      layerSrcMapRef.current[id] = canonicalId
      addLayerToMap(id) // fades in from 0
    }
    applyOrder()
  }, [addLayerToMap, applyOrder])

  useEffect(() => {
    if (mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      attributionControl: false,
      style: {
        version: 8,
        // Flat Mercator projection (default) — world wraps horizontally.
        // Sky fills the space beyond the world edges. Layer sources are added
        // dynamically once the style loads.
        sky: {
          'sky-color': '#0b1026',
          'sky-horizon-blend': 0.3
        },
        sources: {},
        layers: []
      },
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: mapSettings.minZoom,
      maxZoom: mapSettings.maxZoom
    })

    map.on('load', () => {
      buildAllLayers()
      readyRef.current = true
      prevActiveRef.current = activeRef.current
      prevSettingsRef.current = settingsRef.current
    })
    mapRef.current = map

    return () => {
      // Cancel every in-progress crossfade so nothing touches the map after unmount
      for (const h of Object.values(transitionsRef.current)) {
        if (h.cleanup) h.cleanup()
      }
      transitionsRef.current = {}
      map.remove()
      mapRef.current = null
    }
  }, [buildAllLayers])

  // Add/remove/reorder — apply only the diff, not a full rebuild.
  useEffect(() => {
    if (!readyRef.current) { prevActiveRef.current = flattenActive(activeBySection); return }
    const prev = prevActiveRef.current
    const next = flattenActive(activeBySection)
    prevActiveRef.current = next

    for (const id of prev) {
      if (!next.includes(id)) removeLayerFromMap(id)
    }
    for (const id of next) {
      if (!prev.includes(id)) addLayerToMap(id)
    }
    if (prev.join(',') !== next.join(',')) applyOrder()
  }, [activeBySection, removeLayerFromMap, addLayerToMap, applyOrder])

  // Settings changes — opacity via paint property (no rebuild); resolution
  // rebuilds only that layer's source.
  useEffect(() => {
    const prev = prevSettingsRef.current
    if (!readyRef.current) { prevSettingsRef.current = layerSettings; return }
    const map = mapRef.current

    for (const id of Object.keys(layerSettings)) {
      const s = layerSettings[id]
      const p = prev[id]
      if (!p) continue
      if (p.quality !== s.quality) {
        if (activeRef.current.includes(id)) rebuildLayer(id)
      } else if (p.opacity !== s.opacity) {
        const curSrc = layerSrcMapRef.current[id] || `layer-${id}`
        if (activeRef.current.includes(id) && map?.getLayer(curSrc)) {
          map.setPaintProperty(curSrc, 'raster-opacity', s.opacity)
        }
      }
    }
    prevSettingsRef.current = layerSettings
  }, [layerSettings, rebuildLayer])

  // Visibility changes — set raster-opacity to 0 for hidden layers.
  useEffect(() => {
    const map = mapRef.current
    if (!readyRef.current || !map) return
    for (const id of activeRef.current) {
      const curSrc = layerSrcMapRef.current[id] || `layer-${id}`
      if (!map.getLayer(curSrc)) continue
      const s = settingsRef.current[id] ?? DEFAULT_SETTINGS(layerById.get(id))
      const opacity = hiddenLayers.has(id) ? 0 : s.opacity
      map.setPaintProperty(curSrc, 'raster-opacity', opacity)
    }
  }, [hiddenLayers])

  const addLayer = (layer) => {
    const section = layerSection(layer)
    setActiveBySection(prev => {
      if (prev[section].includes(layer.id)) return prev
      return { ...prev, [section]: [layer.id, ...prev[section]] }
    })
    setAddLayerOpen(false)
  }

  const removeLayer = (id) => {
    const section = layerSection(layerById.get(id) || {})
    setActiveBySection(prev => ({ ...prev, [section]: prev[section].filter(x => x !== id) }))
  }

  const reorderSection = (section, nextIds) => {
    setActiveBySection(prev => ({ ...prev, [section]: nextIds }))
  }

  const updateLayerSettings = (id, patch) => {
    setLayerSettings(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const toggleVisibility = useCallback((id) => {
    setHiddenLayers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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

  // Map layer ID → current source/layer ID on the map
  const layerSrcMapRef = useRef({})

  // Active crossfade animations — keyed by layer id.
  // Each entry: { cancelled: boolean }
  const transitionsRef = useRef({})

  const handleDateChange = useCallback((newDate) => {
    setSelectedDate(newDate)
    const map = mapRef.current
    if (!map) return

    const imageryIds = activeRef.current.filter(id => {
      const layer = layerById.get(id)
      return layer && layerSection(layer) !== 'reference'
    })

    for (const id of imageryIds) {
      // Cancel any in-progress transition for this layer
      if (transitionsRef.current[id]) {
        if (transitionsRef.current[id].cleanup) transitionsRef.current[id].cleanup()
        delete transitionsRef.current[id]
      }

      const layer = layerById.get(id)
      const oldSrcId = layerSrcMapRef.current[id] || `layer-${id}`
      if (!map.getLayer(oldSrcId)) continue

      const newSrcId = `layer-${id}-v${Date.now()}`
      const s = settingsRef.current[id] ?? DEFAULT_SETTINGS(layer)
      const isHidden = hiddenRef.current.has(id)
      const targetOpacity = isHidden ? 0 : s.opacity
      const url = buildTileUrlTemplate({ wmtsBaseUrl }, layer, layerTime(layer, newDate))
      const maxZoom = parseInt(layer.tileMatrixSet?.match(/Level(\d+)/)?.[1]) || QUALITY_MAXZOOM[s.quality]

      // Add new source + layer on top of old. Old layer STAYS at full
      // opacity (never faded out) — only the new layer fades in. This
      // guarantees no black screen even if tiles take seconds to load.
      map.addSource(newSrcId, rasterSource([url], maxZoom))
      map.addLayer({
        id: newSrcId,
        type: 'raster',
        source: newSrcId,
        paint: {
          'raster-opacity': 0,
          'raster-opacity-transition': { duration: 1500, delay: 0 }
        }
      })

      // Start fade-in immediately. Old layer stays fully visible underneath.
      setTimeout(() => {
        delete transitionsRef.current[id]
        try {
          map.setPaintProperty(newSrcId, 'raster-opacity', targetOpacity)
        } catch {}
      }, 300)

      // Remove old layer AFTER a long delay (3s) to give tiles plenty of time.
      setTimeout(() => {
        if (layerSrcMapRef.current[id] === newSrcId) {
          try {
            if (map.getLayer(oldSrcId)) map.removeLayer(oldSrcId)
            if (map.getSource(oldSrcId)) map.removeSource(oldSrcId)
          } catch {}
        }
      }, 3000)
      transitionsRef.current[id] = { cleanup: () => {} }
    }
  }, [])

  return (
    <div className="globe-root">
      <div ref={containerRef} className="globe-map" />
      <SideToolbar activeTool={activeTool} onToolClick={handleToolClick} />
      <Sidebar
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
      <div className="globe-bottom-bar">
        <DatePicker
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
        />
      </div>
    </div>
  )
}
