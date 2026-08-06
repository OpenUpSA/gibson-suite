import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './Globe.css'
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
function MapInstance({ tab, layerById, layerCatalog, wmtsBaseUrl, mapSettings, onMapReady }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerSrcMapRef = useRef({})
  const transitionsRef = useRef({})
  const prevDateRef = useRef(tab.date)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: []
      },
      center: mapSettings.center || [0, 30],
      zoom: mapSettings.zoom || 4,
      minZoom: mapSettings.minZoom || 2,
      maxZoom: mapSettings.maxZoom || 12,
      attributionControl: false
    })

    map.on('load', () => {
      mapRef.current = map
      setMapReady(true)
      onMapReady?.(map)
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
  // Each tab has its own independent layer state (activeBySection, layerSettings, hiddenLayers)
  const [tabs, setTabs] = useState([
    {
      id: 'tab-1',
      label: 'View 1',
      activeBySection: initialBySection,
      layerSettings: initialSettings,
      hiddenLayers: new Set(),
      date: defaultDate
    }
  ])
  const [activeTabId, setActiveTabId] = useState('tab-1')
  const [isTabbedMode, setIsTabbedMode] = useState(true)

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

  const handleTabAdd = useCallback(() => {
    const newId = `tab-${Date.now()}`
    const sourceTab = tabs.find(t => t.id === activeTabId) || tabs[0]
    const newTab = {
      id: newId,
      label: `View ${tabs.length + 1}`,
      activeBySection: JSON.parse(JSON.stringify(sourceTab.activeBySection)),
      layerSettings: { ...sourceTab.layerSettings },
      hiddenLayers: new Set(sourceTab.hiddenLayers),
      date: sourceTab.date
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

  return (
    <div className="globe-root">
      <div className="globe-maps-container">
        {tabs.map((tab, index) => (
          <div key={tab.id} className="globe-map-pane" style={{ width: `${100 / tabs.length}%` }}>
            <MapInstance
              tab={tab}
              layerById={layerById}
              layerCatalog={layerCatalog}
              wmtsBaseUrl={wmtsBaseUrl}
              mapSettings={mapSettings}
              onMapReady={(map) => { /* store map instance if needed */ }}
            />
            {index < tabs.length - 1 && (
              <div className="globe-pane-divider" />
            )}
          </div>
        ))}
      </div>
      <SideToolbar activeTool={activeTool} onToolClick={handleToolClick} />
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
