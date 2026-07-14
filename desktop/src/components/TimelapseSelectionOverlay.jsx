import React, { useEffect, useRef, useState } from 'react'

const MIN_SIZE = 20

const CURSORS = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
  e: 'e-resize', se: 'se-resize', s: 's-resize',
  sw: 'sw-resize', w: 'w-resize', move: 'move',
}

export default function TimelapseSelectionOverlay({ map, rectangle, aspectRatio, onChange }) {
  const [rect, setRect] = useState(null)
  const rectRef = useRef(null)
  const dragRef = useRef(null)
  const aspectRatioRef = useRef(aspectRatio)
  const onChangeRef = useRef(onChange)

  useEffect(() => { aspectRatioRef.current = aspectRatio }, [aspectRatio])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const reproject = () => {
    if (dragRef.current) return
    if (!rectangle || !map) return
    const [sw, ne] = rectangle
    const a = map.project([sw[0], sw[1]])
    const b = map.project([ne[0], ne[1]])
    const r = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    }
    rectRef.current = r
    setRect(r)
  }

  useEffect(() => {
    if (!map) return
    reproject()
    map.on('move', reproject)
    return () => map.off('move', reproject)
  }, [map, rectangle])

  const onHandleMouseDown = (e, handle) => {
    e.preventDefault()
    e.stopPropagation()
    if (!rectRef.current) return
    const cr = map.getCanvas().getBoundingClientRect()
    dragRef.current = {
      handle,
      startX: e.clientX - cr.left,
      startY: e.clientY - cr.top,
      startRect: { ...rectRef.current },
    }
  }

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return
      const { handle, startX, startY, startRect } = dragRef.current
      const cr = map.getCanvas().getBoundingClientRect()
      const dx = (e.clientX - cr.left) - startX
      const dy = (e.clientY - cr.top) - startY
      const { x, y, w, h } = startRect

      let newX = x, newY = y, newW = w, newH = h

      if (handle === 'move') {
        newX = x + dx
        newY = y + dy
      } else {
        if (handle.includes('e')) {
          newW = Math.max(MIN_SIZE, w + dx)
        }
        if (handle.includes('w')) {
          newW = Math.max(MIN_SIZE, w - dx)
          newX = x + w - newW
        }
        if (handle.includes('s')) {
          newH = Math.max(MIN_SIZE, h + dy)
        }
        if (handle.includes('n')) {
          newH = Math.max(MIN_SIZE, h - dy)
          newY = y + h - newH
        }

        const ar = aspectRatioRef.current
        if (ar) {
          if (handle === 'n' || handle === 's') {
            newW = newH * ar
            newX = x + w / 2 - newW / 2
          } else if (handle === 'e' || handle === 'w') {
            newH = newW / ar
            newY = y + h / 2 - newH / 2
          } else {
            // corner: let the larger dimension drive to avoid shrinking unexpectedly
            if (newW / newH >= ar) {
              newH = newW / ar
              if (handle.includes('n')) newY = y + h - newH
            } else {
              newW = newH * ar
              if (handle.includes('w')) newX = x + w - newW
            }
          }
        }
      }

      const newRect = { x: newX, y: newY, w: newW, h: newH }
      rectRef.current = newRect
      setRect(newRect)

      const sw = map.unproject([newX, newY + newH])
      const ne = map.unproject([newX + newW, newY])
      onChangeRef.current([[sw.lng, sw.lat], [ne.lng, ne.lat]])
    }

    const onUp = () => { dragRef.current = null }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [map])

  if (!rect) return null

  const { x, y, w, h } = rect
  const hs = 8

  const corners = [
    { id: 'nw', cx: x,     cy: y     },
    { id: 'ne', cx: x + w, cy: y     },
    { id: 'se', cx: x + w, cy: y + h },
    { id: 'sw', cx: x,     cy: y + h },
  ]
  const edges = [
    { id: 'n', cx: x + w / 2, cy: y     },
    { id: 'e', cx: x + w,     cy: y + h / 2 },
    { id: 's', cx: x + w / 2, cy: y + h },
    { id: 'w', cx: x,         cy: y + h / 2 },
  ]

  const handles = aspectRatio ? corners : [...corners, ...edges]

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <div
        style={{
          position: 'absolute',
          left: x, top: y, width: w, height: h,
          border: '2px solid rgba(255,255,255,0.9)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.45)',
          boxSizing: 'border-box',
          pointerEvents: 'auto',
          cursor: CURSORS.move,
        }}
        onMouseDown={(e) => onHandleMouseDown(e, 'move')}
      />
      {handles.map(({ id, cx, cy }) => (
        <div
          key={id}
          style={{
            position: 'absolute',
            left: cx - hs / 2,
            top: cy - hs / 2,
            width: hs,
            height: hs,
            background: '#fff',
            border: '1.5px solid rgba(0,0,0,0.5)',
            borderRadius: 2,
            pointerEvents: 'auto',
            cursor: CURSORS[id],
            zIndex: 11,
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
          onMouseDown={(e) => onHandleMouseDown(e, id)}
        />
      ))}
    </div>
  )
}
