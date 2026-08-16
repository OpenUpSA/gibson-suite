import React, { useRef, useState, useEffect, useCallback } from 'react'
import { MapInstance } from './Globe'
import './CompareOverlay.css'

/**
 * Before/after overlay for two views (tabs). View A is rendered on top of
 * view B and clipped from the right edge by the draggable divider, so the
 * left side of the slider shows A and the right side shows B. Both maps are
 * always geographically locked to the same camera (pan/zoom on one is
 * mirrored to the other); the top map is inert — interaction happens on the
 * bottom map.
 */
const CompareOverlay = ({ tabA, tabB, layerById, layerCatalog, wmtsBaseUrl, mapSettings, onMapReady, onMapPositionChange, captions, anchorPosition }) => {
  const [splitPos, setSplitPos] = useState(50)
  const containerRef = useRef(null)
  const mapsRef = useRef([null, null])
  const syncingRef = useRef(false)
  const [readyCount, setReadyCount] = useState(0)

  // When the compared views change, the MapInstances remount (keys) and
  // report new instances — reset the tracked refs until both are ready.
  useEffect(() => {
    mapsRef.current = [null, null]
    setReadyCount(0)
  }, [tabA?.id, tabB?.id])

  const handleMapReady = useCallback((index) => (map) => {
    mapsRef.current[index] = map
    setReadyCount(c => c + 1)
    onMapReady?.(index, map)
  }, [onMapReady])

  // Always start geographically locked: once both maps are ready, snap both
  // to the SAME camera. The anchor is the active view's position (passed in)
  // so compare opens at the location the user was just looking at; fall back
  // to the interactive bottom map's camera. Runs once per view pair — the
  // per-move lockstep effect below keeps them together afterwards.
  const anchorRef = useRef(anchorPosition)
  anchorRef.current = anchorPosition

  useEffect(() => {
    const maps = mapsRef.current
    if (!maps[0] || !maps[1]) return
    const anchor = anchorRef.current || {
      center: maps[1].getCenter(),
      zoom: maps[1].getZoom(),
      pitch: maps[1].getPitch(),
      bearing: maps[1].getBearing()
    }
    maps.forEach(m => m.jumpTo(anchor))
  }, [readyCount, tabA?.id, tabB?.id])

  // Keep both cameras in lockstep while either map moves (pan, zoom, rotate).
  useEffect(() => {
    const maps = mapsRef.current
    if (!maps[0] || !maps[1]) return

    const sync = (sourceIndex) => {
      if (syncingRef.current) return
      syncingRef.current = true
      const source = maps[sourceIndex]
      const camera = {
        center: source.getCenter(),
        zoom: source.getZoom(),
        pitch: source.getPitch(),
        bearing: source.getBearing()
      }
      maps.forEach((m, i) => {
        if (i !== sourceIndex && m) m.jumpTo(camera)
      })
      syncingRef.current = false
    }

    const handlers = maps.map((m, i) => {
      const handler = () => sync(i)
      m.on('move', handler)
      return handler
    })

    return () => {
      maps.forEach((m, i) => m.off('move', handlers[i]))
    }
  }, [readyCount, tabA?.id, tabB?.id])

  const startDrag = (startClientX) => {
    const container = containerRef.current
    if (!container) return
    const startPos = splitPos
    const containerWidth = container.offsetWidth

    const move = (clientX) => {
      const dx = ((clientX - startClientX) / containerWidth) * 100
      setSplitPos(Math.max(3, Math.min(97, startPos + dx)))
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

  const layerNames = (tab) => {
    const names = (tab?.activeBySection?.imagery || [])
      .map(id => layerById.get(id)?.name)
      .filter(Boolean)
    return names.join(', ') || tab?.label || ''
  }

  // Per-side caption overlay. Each caption is anchored inside its own half
  // of the container (before = left half, after = right half) and positioned
  // within that half by the same position classes the grid view uses.
  const renderCaption = (side) => {
    const cap = captions?.[side]
    if (!cap?.visible || !cap?.text) return null
    const tab = side === 'before' ? tabA : tabB
    const text = cap.text
      .replace(/%date%/g, tab?.date || '')
      .replace(/%layer%/g, layerNames(tab))
    const lines = text.split('\n')
    return (
      <div className={`compare-caption-zone compare-caption-zone--${side}`}>
        <div className={`globe-grid-caption globe-grid-caption--${cap.position || 'bottom-left'}`}>
          <div
            className="globe-grid-caption-bg"
            style={{
              backgroundColor: cap.overlayColor || '#000',
              opacity: cap.overlayOpacity ?? 0.55,
            }}
          />
          <div
            className="globe-grid-caption-text"
            style={{ color: cap.textColor || '#fff', fontSize: `${cap.fontSize || 11}px`, lineHeight: 1.3 }}
          >
            {lines.map((line, li) => (
              <div key={li}>{line}</div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="compare-overlay" ref={containerRef}>
      <div className="compare-map compare-map-bottom">
        <MapInstance
          key={`compare-b-${tabB?.id}`}
          tab={tabB}
          layerById={layerById}
          layerCatalog={layerCatalog}
          wmtsBaseUrl={wmtsBaseUrl}
          mapSettings={mapSettings}
          onMapReady={handleMapReady(1)}
          onMapPositionChange={onMapPositionChange ? onMapPositionChange(1) : undefined}
        />
      </div>
      <div
        className="compare-map compare-map-top"
        style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
      >
        <MapInstance
          key={`compare-a-${tabA?.id}`}
          tab={tabA}
          layerById={layerById}
          layerCatalog={layerCatalog}
          wmtsBaseUrl={wmtsBaseUrl}
          mapSettings={mapSettings}
          onMapReady={handleMapReady(0)}
          onMapPositionChange={onMapPositionChange ? onMapPositionChange(0) : undefined}
        />
      </div>
      <div
        className="compare-divider"
        style={{ left: `${splitPos}%` }}
        onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX) }}
        onTouchStart={(e) => { e.preventDefault(); startDrag(e.touches[0].clientX) }}
      >
        <div className="compare-divider-line" />
        <div className="compare-divider-handle" />
      </div>
      <div className="compare-labels">
        <div className="compare-label compare-label-left">
          <div className="compare-label-title">{tabA?.label || 'Before'}</div>
          <div className="compare-label-date">{tabA?.date}</div>
          <div className="compare-label-name">{layerNames(tabA)}</div>
        </div>
        <div className="compare-label compare-label-right">
          <div className="compare-label-title">{tabB?.label || 'After'}</div>
          <div className="compare-label-date">{tabB?.date}</div>
          <div className="compare-label-name">{layerNames(tabB)}</div>
        </div>
      </div>
      {renderCaption('before')}
      {renderCaption('after')}
    </div>
  )
}

export default CompareOverlay
