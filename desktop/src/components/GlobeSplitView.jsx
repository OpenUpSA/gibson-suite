import React, { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './Globe.css'
import './GlobeSplitView.css'
import SideToolbar from './SideToolbar'
import TabbedSidebar from './TabbedSidebar'
import AddLayerModal from './AddLayerModal'
import DatePicker from './DatePicker'

import layersConfig from '../config/layers.json'
import { buildTileUrlTemplate } from '../config/tileUrl'
import { Icon } from '@iconify/react'

const SECTIONS_CFG = layersConfig.sections || {}
const BASE_LAYERS = SECTIONS_CFG.imagery || []
const OVERLAY_LAYERS = SECTIONS_CFG.reference || []
const layerCatalog = Object.values(SECTIONS_CFG).flat()
const layerById = new Map(layerCatalog.map(l => [l.id, l]))
const { mapSettings, wmtsBaseUrl } = layersConfig

const SECTION_ORDER = ['reference', 'imagery', 'base']
const SECTION_TITLES = {
  base: 'Base layers',
  imagery: 'Imagery layers',
  reference: 'Reference layers'
}

const layerSection = (layer) => layer.section || (layer.role === 'base' ? 'base' : 'reference')

const flattenActive = (bySection) => SECTION_ORDER.flatMap(s => bySection[s] || [])

const defaultDate = (() => {
  const now = new Date()
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  return yesterday.toISOString().split('T')[0]
})()

const layerTime = (layer, date) => (layerSection(layer) === 'reference' ? 'default' : (date || defaultDate))

const QUALITY_MAXZOOM = {
  high: 9,
  medium: 8,
  low: 7
}

const INITIAL_CENTER = [17, 5]
const INITIAL_ZOOM = 2.5

const initialBySection = {
  base: [],
  imagery: [BASE_LAYERS.find(l => l.id === 'VIIRS_NOAA21_CorrectedReflectance_TrueColor')?.id].filter(Boolean),
  reference: [OVERLAY_LAYERS.find(l => l.id === 'Coastlines')?.id].filter(Boolean)
}

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

export default function GlobeSplitView() {
  const [tabs, setTabs] = useState([
    { id: 'tab-1', label: 'View 1', mode: 'layers', layer: BASE_LAYERS[0], date: defaultDate }
  ])
  const [activeTabId, setActiveTabId] = useState('tab-1')
  const [activeTool, setActiveTool] = useState('layers')
  const [addLayerOpen, setAddLayerOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(defaultDate)
  
  const mapRefs = useRef({})
  const containerRefs = useRef({})
  const [paneSizes, setPaneSizes] = useState([100])

  // Initialize map for a tab
  const initMap = useCallback((tabId) => {
    if (mapRefs.current[tabId] || !containerRefs.current[tabId]) return

    const map = new maplibregl.Map({
      container: containerRefs.current[tabId],
      style: {
        version: 8,
        sources: {},
        layers: []
      },
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRefs.current[tabId] = map
  }, [])

  // Cleanup maps on unmount
  useEffect(() => {
    return () => {
      Object.values(mapRefs.current).forEach(map => map?.remove())
    }
  }, [])

  // Sync map views
  useEffect(() => {
    const maps = Object.values(mapRefs.current).filter(Boolean)
    if (maps.length < 2) return

    let syncing = false

    const handleMove = (sourceMap) => {
      if (syncing) return
      syncing = true
      const center = sourceMap.getCenter()
      const zoom = sourceMap.getZoom()
      const pitch = sourceMap.getPitch()
      const bearing = sourceMap.getBearing()
      
      maps.forEach(m => {
        if (m !== sourceMap) {
          m.jumpTo({ center, zoom, pitch, bearing })
        }
      })
      syncing = false
    }

    const handlers = maps.map(map => {
      const handler = () => handleMove(map)
      map.on('move', handler)
      return { map, handler }
    })

    return () => {
      handlers.forEach(({ map, handler }) => {
        map.off('move', handler)
      })
    }
  }, [tabs.length])

  const handleTabAdd = useCallback(() => {
    const newId = `tab-${Date.now()}`
    const newTab = {
      id: newId,
      label: `View ${tabs.length + 1}`,
      mode: 'selector',
      layer: BASE_LAYERS[0],
      date: defaultDate
    }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newId)
    setPaneSizes(prev => {
      const newSize = 100 / (prev.length + 1)
      return prev.map(() => newSize)
    })
  }, [tabs.length])

  const handleTabRemove = useCallback((tabId) => {
    // Remove map
    if (mapRefs.current[tabId]) {
      mapRefs.current[tabId].remove()
      delete mapRefs.current[tabId]
    }

    setTabs(prev => {
      if (prev.length <= 1) return prev
      const newTabs = prev.filter(t => t.id !== tabId)
      if (activeTabId === tabId) {
        setActiveTabId(newTabs[0].id)
      }
      setPaneSizes(prev => {
        const newSize = 100 / (prev.length - 1)
        return prev.slice(0, -1).map(() => newSize)
      })
      return newTabs
    })
  }, [activeTabId])

  const handleTabChange = useCallback((tabId) => {
    setActiveTabId(tabId)
  }, [])

  const handleTabLayerSelect = useCallback((tabId, layer) => {
    setTabs(prev => prev.map(tab => 
      tab.id === tabId 
        ? { ...tab, mode: 'layers', layer, date: defaultDate }
        : tab
    ))
  }, [])

  const handleDividerMouseDown = useCallback((index, e) => {
    e.preventDefault()
    const startX = e.clientX
    const startSizes = [...paneSizes]
    const totalWidth = window.innerWidth

    const handleMouseMove = (e) => {
      const dx = ((e.clientX - startX) / totalWidth) * 100
      const newSizes = [...startSizes]
      let s0 = startSizes[index] + dx
      let s1 = startSizes[index + 1] - dx

      const minS = 15
      const maxS = 85

      if (s0 < minS) { s0 = minS; s1 = startSizes[index] + startSizes[index + 1] - minS }
      if (s1 < minS) { s1 = minS; s0 = startSizes[index] + startSizes[index + 1] - minS }
      if (s0 > maxS) { s0 = maxS; s1 = startSizes[index] + startSizes[index + 1] - maxS }
      if (s1 > maxS) { s1 = maxS; s0 = startSizes[index] + startSizes[index + 1] - maxS }

      newSizes[index] = s0
      newSizes[index + 1] = s1
      setPaneSizes(newSizes)
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [paneSizes])

  return (
    <div className="globe-root">
      <div className="globe-split-maps">
        {tabs.map((tab, i) => (
          <React.Fragment key={tab.id}>
            <div 
              className="globe-split-pane" 
              style={{ width: `${paneSizes[i]}%` }}
            >
              <div 
                ref={el => containerRefs.current[tab.id] = el}
                className="globe-map"
              />
              <div className="globe-pane-label">
                {tab.label}
              </div>
            </div>
            {i < tabs.length - 1 && (
              <div 
                className="globe-split-divider" 
                onMouseDown={(e) => handleDividerMouseDown(i, e)}
              >
                <div className="globe-split-divider-handle" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      <SideToolbar activeTool={activeTool} onToolClick={setActiveTool} />
      
      <TabbedSidebar
        sections={SECTION_ORDER.map(s => ({ key: s, title: SECTION_TITLES[s], ids: [] }))}
        layerById={layerById}
        layerSection={layerSection}
        layerSettings={initialSettings}
        hiddenLayers={new Set()}
        layerCatalog={layerCatalog}
        onRemove={() => {}}
        onReorder={() => {}}
        onSettingsChange={() => {}}
        onToggleVisibility={() => {}}
        onAddClick={() => setAddLayerOpen(true)}
        open={activeTool === 'layers'}
        onClose={() => setActiveTool(null)}
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={handleTabChange}
        onTabAdd={handleTabAdd}
        onTabRemove={handleTabRemove}
        onTabLayerSelect={handleTabLayerSelect}
        layerCatalog_full={layersConfig}
      />

      <AddLayerModal
        catalog={layerCatalog}
        categories={layersConfig.categories || {}}
        activeLayers={[]}
        onAdd={() => {}}
        onRemove={() => {}}
        open={addLayerOpen}
        onClose={() => setAddLayerOpen(false)}
      />

      <div className="globe-bottom-bar">
        <DatePicker
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      </div>
    </div>
  )
}
