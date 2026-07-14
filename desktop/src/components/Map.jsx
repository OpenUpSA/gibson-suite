import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import MapLibreDraw from 'maplibre-gl-draw'
import RectangleMode from 'mapbox-gl-draw-rectangle-mode'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'maplibre-gl-draw/dist/mapbox-gl-draw.css'
import './Map.css'
import LegendBar from './LegendBar'
import { buildTileUrlTemplate } from '../config/tileUrl'
import TimelapseSelectionOverlay from './TimelapseSelectionOverlay'

const COLORMAP_BASE = '/colormaps'

const lngLatToTile = (lng, lat, zoom) => {
  const z = Math.floor(zoom)
  const x = Math.floor((lng + 180) / 360 * Math.pow(2, z))
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z))
  return { z, x, y }
}

const Map = ({ selectedLayer, selectedDate, config, onMapReady, timelapseMode, onDrawRectangle, timelapseRectangle, timelapseAspectRatio, drawRef: externalDrawRef, initialCenter, initialZoom, activeLayerRef, isZenMode, isGlobe, tilePickMode, onTilePick }) => {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const currentLayerIdRef = useRef(null)
  const pendingTransitionRef = useRef(null)
  const lastLayerKeyRef = useRef('')
  const drawRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [colormap, setColormap] = useState(null)
  const [infoOpen, setInfoOpen] = useState(true)
  const lastMouseMoveRef = useRef(0)
  const [layerStatus, setLayerStatus] = useState('idle')
  const [displayedLayer, setDisplayedLayer] = useState(null)
  const pendingDisplayRef = useRef(null)

  useEffect(() => {
    // Initialize map
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        attributionControl: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256
            }
          },
          layers: [
            {
              id: 'osm',
              type: 'raster',
              source: 'osm',
              minzoom: 0,
              maxzoom: 22
            }
          ]
        },
        center: initialCenter || [config.mapSettings.center[1], config.mapSettings.center[0]],
        zoom: initialZoom ?? config.mapSettings.zoom,
        minZoom: config.mapSettings.minZoom,
        maxZoom: config.mapSettings.maxZoom
      })

      mapInstanceRef.current.addControl(
        new maplibregl.NavigationControl(),
        'bottom-right'
      )

      // Log map load event
      mapInstanceRef.current.on('load', () => {
        console.log('Map loaded successfully')
      })

      if (onMapReady) {
        onMapReady(mapInstanceRef.current)
      }
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [config])

  // Draw control for timelapse
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const setupDraw = () => {
      if (drawRef.current) return
      drawRef.current = new MapLibreDraw({
        displayControlsDefault: false,
        controls: {
          polygon: false,
          line_string: false,
          trash: false
        },
        defaultMode: 'draw_rectangle',
        modes: {
          ...MapLibreDraw.modes,
          draw_rectangle: RectangleMode
        }
      })
      map.addControl(drawRef.current)
      if (externalDrawRef) externalDrawRef.current = drawRef.current

      const onDrawCreate = (e) => {
        const coords = e.features[0].geometry.coordinates[0]
        const sw = [coords[0][0], coords[0][1]]
        const ne = [coords[2][0], coords[2][1]]
        if (onDrawRectangle) onDrawRectangle([sw, ne])
        // Hand off to the overlay for editing; clear MapLibreDraw feature
        drawRef.current.deleteAll()
        drawRef.current.changeMode('simple_select')
        mapInstanceRef.current.fitBounds([[sw[0], sw[1]], [ne[0], ne[1]]], { padding: 40, animate: true, duration: 500 })
      }

      const onDrawUpdate = (e) => {
        const coords = e.features[0].geometry.coordinates[0]
        const sw = [coords[0][0], coords[0][1]]
        const ne = [coords[2][0], coords[2][1]]
        if (onDrawRectangle) onDrawRectangle([sw, ne])
      }

      map.on('draw.create', onDrawCreate)
      map.on('draw.update', onDrawUpdate)
    }

    const teardownDraw = () => {
      if (drawRef.current) {
        try { map.removeControl(drawRef.current) } catch {}
        drawRef.current = null
      }
    }

    if (timelapseMode) {
      if (map.loaded()) {
        setupDraw()
      } else {
        map.once('load', setupDraw)
      }
    } else {
      if (onDrawRectangle) onDrawRectangle(null)
      teardownDraw()
    }

    return () => {
      if (!timelapseMode) teardownDraw()
    }
  }, [timelapseMode])

  // Clear draw features when rectangle is cleared
  const rectangleWasSet = useRef(false)
  useEffect(() => {
    if (timelapseRectangle) rectangleWasSet.current = true
    if (!timelapseMode || !drawRef.current || !rectangleWasSet.current) return
    if (!timelapseRectangle) {
      drawRef.current.deleteAll()
      drawRef.current.changeMode('draw_rectangle')
      rectangleWasSet.current = false
    }
  }, [timelapseRectangle, timelapseMode])

  // Fetch colormap XML for tooltip lookup
  useEffect(() => {
    if (!selectedLayer?.legendId) { setColormap(null); return }

    const fetchColormap = async () => {
      const url = `${COLORMAP_BASE}/${selectedLayer.legendId}.xml`
      try {
        const res = await fetch(url, { mode: 'cors' })
        if (!res.ok) { setColormap(null); return }
        const text = await res.text()
        const doc = new DOMParser().parseFromString(text, 'text/xml')
        if (doc.querySelector('parsererror')) { setColormap(null); return }

        const colorMaps = Array.from(doc.querySelectorAll('ColorMap'))
        const dataColorMap = colorMaps.find(cm => {
          const cmEntries = cm.querySelectorAll('ColorMapEntry')
          return Array.from(cmEntries).some(e => e.getAttribute('nodata') !== 'true')
        })
        const units = dataColorMap?.getAttribute('units') || ''

        const entries = Array.from(doc.querySelectorAll('ColorMapEntry'))
        const lookup = []
        entries.forEach(entry => {
          const isNodata = entry.getAttribute('nodata') === 'true'
          const rgb = entry.getAttribute('rgb')
          const ref = parseInt(entry.getAttribute('ref'), 10)
          if (rgb && !isNodata) {
            lookup[ref] = rgb.split(',').map(Number)
          }
        })

        const values = []
        const legendEntries = doc.querySelectorAll('Legend[type="continuous"] > LegendEntry')
        legendEntries.forEach(entry => {
          const id = parseInt(entry.getAttribute('id'), 10)
          if (id >= 1) {
            values[id] = entry.getAttribute('tooltip') || ''
          }
        })

        setColormap({ lookup, values, units })
      } catch { setColormap(null) }
    }

    fetchColormap()
  }, [selectedLayer?.legendId])

  // Map mousemove handler for pixel tooltip
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !colormap || timelapseMode) { setTooltip(null); return }

    map.getCanvas().style.cursor = 'default'

    const onMouseMove = (e) => {
      const now = Date.now()
      if (now - lastMouseMoveRef.current < 50) return
      lastMouseMoveRef.current = now

      const canvas = map.getCanvas()
      const dpr = window.devicePixelRatio || 1
      const opts = { preserveDrawingBuffer: true }
      const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts)
      if (!gl) return

      const x = e.point.x * dpr
      const y = canvas.height - e.point.y * dpr

      const pixels = new Uint8Array(4)
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      const [r, g, b, a] = pixels
      if (a < 200) { setTooltip(null); return }

      const { lookup, values } = colormap
      let bestDist = Infinity
      let bestIdx = -1

      lookup.forEach((color, idx) => {
        if (!color) return
        const dr = r - color[0]
        const dg = g - color[1]
        const db = b - color[2]
        const dist = dr * dr + dg * dg + db * db
        if (dist < bestDist) { bestDist = dist; bestIdx = idx }
      })

      if (bestIdx >= 0 && values[bestIdx]) {
        const color = lookup[bestIdx]
        const luminance = color ? 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2] : 128
        setTooltip({
          value: values[bestIdx],
          unit: colormap.units,
          x: e.point.x,
          y: e.point.y,
          bg: color ? `rgb(${color[0]},${color[1]},${color[2]})` : '#222',
          fg: luminance > 128 ? '#000' : '#fff'
        })
      } else {
        setTooltip(null)
      }
    }

    const onMouseLeave = () => setTooltip(null)

    map.on('mousemove', onMouseMove)
    map.on('mouseleave', onMouseLeave)
    return () => {
      map.off('mousemove', onMouseMove)
      map.off('mouseleave', onMouseLeave)
      const canvas = map.getCanvas()
      if (canvas) canvas.style.cursor = ''
    }
  }, [colormap, timelapseMode])

  // Tile pick mode click handler
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !tilePickMode) return

    map.getCanvas().style.cursor = 'crosshair'

    const onClick = (e) => {
      const { lng, lat } = e.lngLat
      const zoom = map.getZoom()
      const tile = lngLatToTile(lng, lat, zoom)
      if (onTilePick) onTilePick(tile)
    }

    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
      const canvas = map.getCanvas()
      if (canvas) canvas.style.cursor = ''
    }
  }, [tilePickMode, onTilePick])

  // Update GIBS layer when selectedLayer changes
  useEffect(() => {
    if (!selectedLayer || !mapInstanceRef.current) return

    const layerKey = `${selectedLayer.id}/${selectedLayer.time}`
    if (layerKey === lastLayerKeyRef.current) return
    lastLayerKeyRef.current = layerKey

    const map = mapInstanceRef.current

    setColormap(null)
    setLayerStatus('loading')
    pendingDisplayRef.current = selectedLayer

    const timeoutId = setTimeout(() => {
      setLayerStatus('error')
    }, 15000)

    const doUpdate = () => {
      if (pendingTransitionRef.current) {
        pendingTransitionRef.current.cancel()
        pendingTransitionRef.current = null
      }
      pendingTransitionRef.current = updateGibsLayer(map, selectedLayer, config, currentLayerIdRef, activeLayerRef, setLayerStatus, () => clearTimeout(timeoutId))
    }

    if (!map.loaded()) {
      map.once('load', doUpdate)
    } else {
      doUpdate()
    }

    return () => {
      clearTimeout(timeoutId)
      lastLayerKeyRef.current = ''
    }
  }, [selectedLayer, config])

  useEffect(() => {
    if (layerStatus === 'loaded' && pendingDisplayRef.current) {
      setDisplayedLayer(pendingDisplayRef.current)
    }
  }, [layerStatus])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    const projection = { type: isGlobe ? 'globe' : 'mercator' }
    if (map.loaded()) {
      map.setProjection(projection)
    } else {
      map.once('load', () => map.setProjection(projection))
    }
  }, [isGlobe])

  return (
    <div className="map-wrapper-container" onMouseLeave={() => setTooltip(null)}>
      <div ref={mapContainerRef} className="map-container" />
      {timelapseMode && timelapseRectangle && mapInstanceRef.current && (
        <TimelapseSelectionOverlay
          map={mapInstanceRef.current}
          rectangle={timelapseRectangle}
          aspectRatio={timelapseAspectRatio}
          onChange={onDrawRectangle}
        />
      )}
      {!timelapseMode && !isZenMode && (
        <div className="map-overlay-top-right">
          <div className="map-info-box">
            {displayedLayer?.legendId && <LegendBar key={displayedLayer.legendId} layer={displayedLayer} status={layerStatus} />}
            <button className="map-info-header" onClick={() => setInfoOpen(!infoOpen)}>
              <span className="map-info-name">{displayedLayer?.name ?? ''}</span>
              <span className="map-info-header-right">
                {layerStatus === 'loading' && <span className="map-layer-spinner" />}
                {layerStatus !== 'loading' && <span className={`map-info-chevron ${infoOpen ? 'open' : ''}`}>▾</span>}
              </span>
            </button>
            {infoOpen && displayedLayer && (
              <div className="map-info-details">
                {displayedLayer.time && <div className="map-info-date">{displayedLayer.time}</div>}
                <div className="map-info-description">{displayedLayer?.description}</div>
              </div>
            )}
          </div>
        </div>
      )}
      {!timelapseMode && isZenMode && displayedLayer?.time && (
        <div className="map-zen-date">
          {layerStatus === 'loading' && <span className="map-layer-spinner" />}
          <span>{displayedLayer.time}</span>
        </div>
      )}
      {tooltip && (
        <div className="map-tooltip" style={{ left: tooltip.x + 15, top: tooltip.y + 15, background: tooltip.bg, color: tooltip.fg, borderColor: tooltip.bg }}>
          {tooltip.value}{tooltip.unit ? ` ${tooltip.unit}` : ''}
        </div>
      )}
    </div>
  )
}

// Helper function to update GIBS layer with fade-in transition
const updateGibsLayer = (map, selectedLayer, config, currentLayerIdRef, activeLayerRef, setLayerStatus, onLoaded) => {
  const ts = Date.now()
  const newSourceId = `gibs-source-${ts}`
  const newLayerId = `gibs-layer-${ts}`

  const prev = currentLayerIdRef.current
  const prevLayerId = prev?.layerId || null
  const prevSourceId = prev?.sourceId || null

  const urlTemplate = buildTileUrlTemplate(config, selectedLayer, selectedLayer.time)
  // WMS rasterises vector products at any scale, so don't cap at the native TMS level
  const maxZoom = selectedLayer.wms ? 12 : parseInt(selectedLayer.tileMatrixSet.match(/Level(\d+)/)?.[1]) || undefined

  map.addSource(newSourceId, {
    type: 'raster',
    tiles: [urlTemplate],
    tileSize: 256,
    minzoom: 1,
    maxzoom: maxZoom,
    attribution: 'NASA GIBS',
    bounds: [-180, -85.0511287798, 180, 85.0511287798]
  })

  // Add new layer invisible; transition defined so setPaintProperty animates it
  map.addLayer({
    id: newLayerId,
    type: 'raster',
    source: newSourceId,
    paint: {
      'raster-opacity': 0,
      'raster-opacity-transition': { duration: 600, delay: 0 }
    }
  })

  currentLayerIdRef.current = { layerId: newLayerId, sourceId: newSourceId }
  if (activeLayerRef) activeLayerRef.current = { layerId: newLayerId, sourceId: newSourceId }

  let settled = false

  const finish = (status) => {
    if (settled) return
    settled = true
    map.off('sourcedata', onData)
    map.off('error', onError)
    onLoaded()
    setLayerStatus(status)
  }

  const fadeInNew = () => {
    if (settled) return
    // Fade in new layer
    map.setPaintProperty(newLayerId, 'raster-opacity', 0.8)
    // Fade out old layer concurrently
    if (prevLayerId && map.getLayer(prevLayerId)) {
      try {
        map.setPaintProperty(prevLayerId, 'raster-opacity-transition', { duration: 400, delay: 0 })
        map.setPaintProperty(prevLayerId, 'raster-opacity', 0)
      } catch (_) {}
    }
    // Remove old layer after fade completes
    setTimeout(() => {
      if (prevLayerId && map.getLayer(prevLayerId)) map.removeLayer(prevLayerId)
      if (prevSourceId && map.getSource(prevSourceId)) map.removeSource(prevSourceId)
    }, 700)
    finish('loaded')
  }

  const onData = (e) => {
    if (e.sourceId !== newSourceId || !e.isSourceLoaded) return
    map.off('sourcedata', onData)
    // Wait for map idle so all visible tiles are rendered before fading in
    map.once('idle', fadeInNew)
  }

  const onError = (e) => {
    if (e.sourceId !== newSourceId) return
    finish('error')
  }

  map.on('sourcedata', onData)
  map.on('error', onError)

  return {
    cancel() {
      if (settled) return
      settled = true
      map.off('sourcedata', onData)
      map.off('error', onError)
      // Immediately clean up layers that were waiting (never faded in)
      if (prevLayerId && map.getLayer(prevLayerId)) map.removeLayer(prevLayerId)
      if (prevSourceId && map.getSource(prevSourceId)) map.removeSource(prevSourceId)
    }
  }
}

export default Map
