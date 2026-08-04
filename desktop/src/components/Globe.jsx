import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './Globe.css'
import SideToolbar from './SideToolbar'
import Sidebar from './Sidebar'
import AddLayerModal from './AddLayerModal'

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
const layerTime = (layer) => (layerSection(layer) === 'reference' ? 'default' : defaultDate)

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
const DEFAULT_SETTINGS = (layer) => ({
  quality: 'low',
  opacity: layerSection(layer) === 'imagery' ? 0.8 : (layerSection(layer) === 'base' ? 1 : 0.9)
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

export default function Globe() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [activeBySection, setActiveBySection] = useState(initialBySection)
  const [layerSettings, setLayerSettings] = useState(initialSettings)
  const [activeTool, setActiveTool] = useState('layers') // 'layers' | null
  const [addLayerOpen, setAddLayerOpen] = useState(false)

  // Refs mirror state so the map 'load' handler and effects read fresh values.
  // activeRef holds the flattened ordered list (index 0 = top) used by the map.
  const activeRef = useRef(flattenActive(activeBySection))
  const settingsRef = useRef(layerSettings)
  const readyRef = useRef(false)
  const prevActiveRef = useRef(flattenActive(activeBySection))
  const prevSettingsRef = useRef(layerSettings)
  activeRef.current = flattenActive(activeBySection)
  settingsRef.current = layerSettings

  // Add a single layer (source + layer) to the map.
  const addLayerToMap = useCallback((id) => {
    const map = mapRef.current
    const layer = layerById.get(id)
    if (!map || !layer) return
    const srcId = `layer-${id}`
    if (map.getSource(srcId)) return
    const s = settingsRef.current[id] ?? DEFAULT_SETTINGS(layer)
    const url = buildTileUrlTemplate({ wmtsBaseUrl }, layer, layerTime(layer))
    map.addSource(srcId, rasterSource([url], QUALITY_MAXZOOM[s.quality]))
    map.addLayer({
      id: srcId,
      type: 'raster',
      source: srcId,
      paint: { 'raster-opacity': s.opacity }
    })
  }, [])

  // Remove a single layer (source + layer) from the map.
  const removeLayerFromMap = useCallback((id) => {
    const map = mapRef.current
    if (!map) return
    const srcId = `layer-${id}`
    try {
      if (map.getLayer(srcId)) map.removeLayer(srcId)
      if (map.getSource(srcId)) map.removeSource(srcId)
    } catch { /* already gone */ }
  }, [])

  // Normalize stacking so index 0 (top of list) renders on top, without
  // rebuilding any sources — moves each layer to the top in reverse order.
  const applyOrder = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    for (const id of [...activeRef.current].reverse()) {
      const srcId = `layer-${id}`
      if (map.getLayer(srcId)) map.moveLayer(srcId)
    }
  }, [])

  // Rebuild a single layer's source (needed when its resolution changes —
  // source maxzoom is fixed at creation). Only that layer is touched.
  const rebuildLayer = useCallback((id) => {
    const map = mapRef.current
    const layer = layerById.get(id)
    if (!map || !layer) return
    removeLayerFromMap(id)
    addLayerToMap(id)
    applyOrder()
  }, [addLayerToMap, removeLayerFromMap, applyOrder])

  // Initial build — called once when the style loads.
  const buildAllLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    for (const srcId of Object.keys(map.getStyle().sources || {}).filter(id => id.startsWith('layer-'))) {
      try { map.removeLayer(srcId); map.removeSource(srcId) } catch { /* already gone */ }
    }
    for (const id of [...activeRef.current].reverse()) {
      addLayerToMap(id)
    }
    applyOrder()
  }, [addLayerToMap, applyOrder])

  useEffect(() => {
    if (mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
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
        if (activeRef.current.includes(id) && map?.getLayer(`layer-${id}`)) {
          map.setPaintProperty(`layer-${id}`, 'raster-opacity', s.opacity)
        }
      }
    }
    prevSettingsRef.current = layerSettings
  }, [layerSettings, rebuildLayer])

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

  // Toolbar: clicking the active tool closes its panel; clicking another
  // switches to it. Opening one panel closes the other.
  const handleToolClick = (tool) => {
    setActiveTool(prev => (prev === tool ? null : tool))
  }

  return (
    <div className="globe-root">
      <div ref={containerRef} className="globe-map" />
      <SideToolbar activeTool={activeTool} onToolClick={handleToolClick} />
      <Sidebar
        sections={SECTION_ORDER.map(s => ({ key: s, title: SECTION_TITLES[s], ids: activeBySection[s] || [] }))}
        layerById={layerById}
        layerSection={layerSection}
        layerSettings={layerSettings}
        onRemove={removeLayer}
        onReorder={reorderSection}
        onSettingsChange={updateLayerSettings}
        onAddClick={() => setAddLayerOpen(true)}
        open={activeTool === 'layers'}
        onClose={() => setActiveTool(null)}
      />
      <AddLayerModal
        catalog={layerCatalog}
        activeLayers={flattenActive(activeBySection)}
        onAdd={addLayer}
        open={addLayerOpen}
        onClose={() => setAddLayerOpen(false)}
      />
    </div>
  )
}
