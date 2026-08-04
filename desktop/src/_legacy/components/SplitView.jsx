import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Map from './Map'
import CropOverlay from './CropOverlay'
import './SplitView.css'

const SplitView = ({
  config,
  panes,
  crop,
  onCropChange,
  onMapInstancesReady,
  syncEnabled,
  initialView
}) => {
  const [maps, setMaps] = useState([])
  const [paneSizes, setPaneSizes] = useState([])
  const containerRef = useRef(null)
  const syncingRef = useRef(false)
  const mapsRef = useRef([])

  const paneLayers = useMemo(
    () => panes.map(p => ({ ...p.layer, time: p.date })),
    [panes.map(p => `${p.layer.id}/${p.date}`).join('|')]
  )

  useEffect(() => {
    setPaneSizes(panes.map(() => 100 / panes.length))
  }, [panes.length])

  const handleMapReady = useCallback((index) => (instance) => {
    const newMaps = [...mapsRef.current]
    newMaps[index] = instance
    mapsRef.current = newMaps
    setMaps(newMaps)

    if (newMaps.length === panes.length && newMaps.every(m => m != null)) {
      onMapInstancesReady(newMaps)
    }
  }, [panes.length, onMapInstancesReady])

  useEffect(() => {
    if (maps.length < 2 || !syncEnabled) return

    const handleMove = (sourceIndex) => {
      if (syncingRef.current) return
      syncingRef.current = true
      const source = maps[sourceIndex]
      if (!source) { syncingRef.current = false; return }
      const center = source.getCenter()
      const zoom = source.getZoom()
      const pitch = source.getPitch()
      const bearing = source.getBearing()
      maps.forEach((m, i) => {
        if (i !== sourceIndex && m) {
          m.jumpTo({ center, zoom, pitch, bearing })
        }
      })
      syncingRef.current = false
    }

    const handlers = maps.map((m, i) => {
      const handler = () => handleMove(i)
      if (m) m.on('move', handler)
      return handler
    })

    return () => {
      maps.forEach((m, i) => {
        if (m) m.off('move', handlers[i])
      })
    }
  }, [maps, syncEnabled])

  const handleDividerMouseDown = useCallback((index, e) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const startX = e.clientX
    const startSizes = [...paneSizes]
    const containerWidth = container.offsetWidth

    const handleMouseMove = (e) => {
      const dx = ((e.clientX - startX) / containerWidth) * 100
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
    <div className="split-view" ref={containerRef}>
      <CropOverlay crop={crop} onChange={onCropChange} />
      {panes.map((pane, i) => (
        <React.Fragment key={i}>
          <div className="split-pane" style={{ width: `${paneSizes[i] || 100 / panes.length}%` }}>
            <Map
              selectedLayer={paneLayers[i]}
              config={config}
              onMapReady={handleMapReady(i)}
              initialCenter={initialView?.center}
              initialZoom={initialView?.zoom}
            />
          </div>
          {i < panes.length - 1 && (
            <div className="split-divider" onMouseDown={(e) => handleDividerMouseDown(i, e)}>
              <div className="split-divider-handle" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export default SplitView
