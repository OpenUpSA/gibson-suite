import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Map from './Map'
import './CompareView.css'

const CompareView = ({ config, panes, onMapInstancesReady, onSplitPosChange, initialView }) => {
  const [splitPos, setSplitPos] = useState(50)
  const containerRef = useRef(null)
  const mapsRef = useRef([null, null])
  const syncingRef = useRef(false)

  const pane0Layer = useMemo(() => ({ ...panes[0].layer, time: panes[0].date }), [panes[0]?.layer?.id, panes[0]?.layer, panes[0]?.date])
  const pane1Layer = useMemo(() => ({ ...panes[1].layer, time: panes[1].date }), [panes[1]?.layer?.id, panes[1]?.layer, panes[1]?.date])

  const handleMapReady = useCallback((index) => (instance) => {
    mapsRef.current[index] = instance
    if (mapsRef.current[0] && mapsRef.current[1]) {
      onMapInstancesReady(mapsRef.current)
    }
  }, [onMapInstancesReady])

  useEffect(() => {
    const maps = mapsRef.current.filter(Boolean)
    if (maps.length < 2) return

    const handleMove = (sourceIndex) => {
      if (syncingRef.current) return
      syncingRef.current = true
      const source = maps[sourceIndex]
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
      m.on('move', handler)
      return handler
    })

    return () => {
      maps.forEach((m, i) => {
        m.off('move', handlers[i])
      })
    }
  }, [panes])

  const startDrag = (startClientX) => {
    const container = containerRef.current
    if (!container) return
    const startPos = splitPos
    const containerWidth = container.offsetWidth

    const move = (clientX) => {
      const dx = ((clientX - startClientX) / containerWidth) * 100
      const newPos = Math.max(3, Math.min(97, startPos + dx))
      setSplitPos(newPos)
      onSplitPosChange?.(newPos)
    }

    const onMouseMove = (e) => move(e.clientX)
    const onTouchMove = (e) => { e.preventDefault(); move(e.touches[0].clientX) }
    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', cleanup)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', cleanup)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', cleanup)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', cleanup)
  }

  const handleDividerMouseDown = (e) => {
    e.preventDefault()
    startDrag(e.clientX)
  }

  const handleDividerTouchStart = (e) => {
    e.preventDefault()
    startDrag(e.touches[0].clientX)
  }

  return (
    <div className="compare-view" ref={containerRef}>
      <div className="compare-map compare-map-bottom">
        <Map
          selectedLayer={pane1Layer}
          config={config}
          onMapReady={handleMapReady(1)}
          initialCenter={initialView?.center}
          initialZoom={initialView?.zoom}
        />
      </div>
      <div
        className="compare-map compare-map-top"
        style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
      >
        <Map
          selectedLayer={pane0Layer}
          config={config}
          onMapReady={handleMapReady(0)}
          initialCenter={initialView?.center}
          initialZoom={initialView?.zoom}
        />
      </div>
      <div
        className="compare-divider"
        style={{ left: `${splitPos}%` }}
        onMouseDown={handleDividerMouseDown}
        onTouchStart={handleDividerTouchStart}
      >
        <div className="compare-divider-line" />
        <div className="compare-divider-handle" />
      </div>
      <div className="compare-labels">
        <div className="compare-label compare-label-left">
          <div className="compare-label-date">{panes[0].date}</div>
          <div className="compare-label-name">{panes[0].layer.name}</div>
        </div>
        <div className="compare-label compare-label-right">
          <div className="compare-label-date">{panes[1].date}</div>
          <div className="compare-label-name">{panes[1].layer.name}</div>
        </div>
      </div>
    </div>
  )
}

export default CompareView