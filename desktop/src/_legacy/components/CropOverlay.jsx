import React, { useRef, useCallback } from 'react'
import './CropOverlay.css'

const CropOverlay = ({ crop, onChange }) => {
  const overlayRef = useRef(null)
  const dragRef = useRef(null)

  const handleMouseDown = useCallback((side, e) => {
    e.preventDefault()
    e.stopPropagation()
    const overlay = overlayRef.current
    if (!overlay) return

    dragRef.current = { side, startVal: crop[side], startY: e.clientY }

    const handleMouseMove = (e) => {
      if (!dragRef.current) return
      const { side, startVal, startY } = dragRef.current
      const dp = side === 'bottom' ? startY - e.clientY : e.clientY - startY
      const size = overlay.offsetHeight
      const newVal = Math.max(0, Math.min(size * 0.4, startVal + dp))
      onChange({ ...crop, [side]: Math.round(newVal) })
    }

    const handleMouseUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [crop, onChange])

  const h = (v) => `${Math.round(v)}px`

  return (
    <div className="crop-overlay" ref={overlayRef}>
      <div
        className="crop-overlay-shade crop-overlay-shade-top"
        style={{ height: h(crop.top) }}
        onMouseDown={(e) => handleMouseDown('top', e)}
      />
      <div
        className="crop-overlay-shade crop-overlay-shade-bottom"
        style={{ height: h(crop.bottom) }}
        onMouseDown={(e) => handleMouseDown('bottom', e)}
      />
      <div
        className="crop-overlay-handle"
        style={{ top: h(crop.top), left: '50%', transform: 'translate(-50%, -50%)', cursor: 's-resize' }}
        onMouseDown={(e) => handleMouseDown('top', e)}
      />
      <div
        className="crop-overlay-handle"
        style={{ top: `calc(100% - ${h(crop.bottom)})`, left: '50%', transform: 'translate(-50%, -50%)', cursor: 'n-resize' }}
        onMouseDown={(e) => handleMouseDown('bottom', e)}
      />
    </div>
  )
}

export default CropOverlay