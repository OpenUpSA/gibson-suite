import React, { useRef, useState, useEffect, useCallback } from 'react'
import { MapInstance } from './Globe'
import './CompareOverlay.css'

/**
 * Before/after overlay for two views (tabs). View A is rendered on top of
 * view B. In split mode the top view is clipped from the right edge by the
 * draggable divider, so the left side of the slider shows A and the right
 * side shows B. In fade mode the top view is not clipped — the divider's
 * position instead maps to its opacity (left = transparent, right = opaque),
 * crossfading between the two views. Both maps are always geographically
 * locked to the same camera (pan/zoom on one is mirrored to the other); the
 * top map is inert — interaction happens on the bottom map.
 */
const CompareOverlay = ({ tabA, tabB, layerById, layerCatalog, wmtsBaseUrl, mapSettings, onMapReady, onMapPositionChange, captions, anchorPosition, mode = 'split', splitPos: splitPosProp, onSplitPosChange, onLayerLoadError, visible = true, autoTimeA = null, autoTimeB = null }) => {
  const [internalSplitPos, setInternalSplitPos] = useState(50)
  const containerRef = useRef(null)
  // Both panes' MapLibre instances, as [top (view A), bottom (view B)]. Held in
  // state rather than a ref so the lockstep and anchoring effects re-run
  // whenever the pair changes. A "both maps ready" counter is not enough: the
  // panes are keyed by view id, so swapping the view on ONE side remounts only
  // that pane — the counter would never reach two again and the surviving map
  // would be dropped, leaving the two panes free to drift apart for good.
  const [maps, setMaps] = useState([null, null])
  const syncingRef = useRef(false)
  const isFade = mode === 'fade'

  // Controlled (splitPos prop) or uncontrolled (internal state). The Globe
  // passes splitPos down so the sidebar cells can mirror the fade amount;
  // the share route (CompareShare) leaves it uncontrolled.
  const splitPos = splitPosProp !== undefined ? splitPosProp : internalSplitPos
  const setSplitPos = (value) => {
    if (splitPosProp !== undefined) onSplitPosChange?.(value)
    else setInternalSplitPos(value)
  }

  // A pane reports its map when it mounts, and again when it is torn down.
  // Both handlers check the instance they were handed against the slot it owns,
  // so the late cleanup of a map that has already been replaced can never clear
  // its successor's slot.
  const handleMapReady = useCallback((index) => (map) => {
    setMaps(prev => {
      if (prev[index] === map) return prev
      const next = [...prev]
      next[index] = map
      return next
    })
    onMapReady?.(index, map)
  }, [onMapReady])

  const handleMapGone = useCallback((index) => (map) => {
    setMaps(prev => {
      if (prev[index] !== map) return prev
      const next = [...prev]
      next[index] = null
      return next
    })
  }, [])

  // Always start geographically locked: once both maps exist, snap both to the
  // SAME camera. The anchor is the active view's position (passed in) so
  // compare opens at the location the user was just looking at; fall back to
  // the interactive bottom map's camera. The maps are kept alive while the
  // compare view is hidden (so leaving and returning doesn't reload tiles), so
  // this also re-runs when compare is reopened — it IS the "opens where you
  // are looking" behaviour, which a fresh mount used to provide for free.
  //
  // This re-runs whenever the PAIR changes, which is what re-locks the panes
  // after one side is reassigned: the remounted pane starts at its own view's
  // saved camera, which need not match its partner's.
  const anchorRef = useRef(anchorPosition)
  anchorRef.current = anchorPosition

  useEffect(() => {
    if (!visible) return
    const [top, bottom] = maps
    if (!top || !bottom) return
    const anchor = anchorRef.current || {
      center: bottom.getCenter(),
      zoom: bottom.getZoom(),
      pitch: bottom.getPitch(),
      bearing: bottom.getBearing()
    }
    maps.forEach(m => m.jumpTo(anchor))
  }, [maps, visible])

  // Keep both cameras in lockstep while either map moves (pan, zoom, rotate).
  // The guard is safe because MapLibre fires the 'move' that jumpTo raises
  // synchronously, so the partner's handler is still inside this call.
  useEffect(() => {
    const [top, bottom] = maps
    if (!top || !bottom) return

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
  }, [maps])

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
      .replace(/%time%/g, tab?.time ? `${tab.time}Z` : '')
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
          autoTime={autoTimeB}
          followCamera={false}
          onMapReady={handleMapReady(1)}
          onMapGone={handleMapGone(1)}
          onMapPositionChange={onMapPositionChange ? onMapPositionChange(1) : undefined}
          onLayerLoadError={(layerId, failedDate, displayedDate, message) => onLayerLoadError?.(1, layerId, failedDate, displayedDate, message)}
        />
      </div>
      <div
        className="compare-map compare-map-top"
        style={isFade
          ? { opacity: splitPos / 100 }
          : { clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
      >
        <MapInstance
          key={`compare-a-${tabA?.id}`}
          tab={tabA}
          layerById={layerById}
          layerCatalog={layerCatalog}
          wmtsBaseUrl={wmtsBaseUrl}
          mapSettings={mapSettings}
          autoTime={autoTimeA}
          followCamera={false}
          onMapReady={handleMapReady(0)}
          onMapGone={handleMapGone(0)}
          onMapPositionChange={onMapPositionChange ? onMapPositionChange(0) : undefined}
          onLayerLoadError={(layerId, failedDate, displayedDate, message) => onLayerLoadError?.(0, layerId, failedDate, displayedDate, message)}
        />
      </div>
      <div
        className={`compare-divider${isFade ? ' compare-divider--fade' : ''}`}
        style={{ left: `${splitPos}%` }}
        onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX) }}
        onTouchStart={(e) => { e.preventDefault(); startDrag(e.touches[0].clientX) }}
      >
        {!isFade && <div className="compare-divider-line" />}
        <div className="compare-divider-handle">
          {isFade && <span className="compare-divider-opacity">{Math.round(splitPos)}%</span>}
        </div>
      </div>
      {renderCaption('before')}
      {renderCaption('after')}
    </div>
  )
}

export default CompareOverlay
