import { useEffect, useRef, useState } from 'react'
import { HexAlphaColorPicker, HexColorPicker } from 'react-colorful'
import { Icon } from '@iconify/react'
import './GridCaptionColorPicker.css'

const toAlphaHex = (color, opacity) => {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color || '')
  const rgb = match?.[1] || '000000'
  const alpha = match?.[2] || Math.round((opacity ?? 0.55) * 255).toString(16).padStart(2, '0')
  return `#${rgb}${alpha}`
}

const GridCaptionColorPicker = ({ color, opacity, onChange, icon, title, withAlpha = false }) => {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef(null)
  const value = withAlpha ? toAlphaHex(color, opacity) : color.slice(0, 7)
  const Picker = withAlpha ? HexAlphaColorPicker : HexColorPicker

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  return (
    <div className="grid-caption-color-picker" ref={pickerRef}>
      <Icon icon={icon} width="14" height="14" title={title} />
      <button
        type="button"
        className="grid-caption-color-trigger"
        onClick={() => setOpen(current => !current)}
        title={title}
        aria-label={title}
        aria-expanded={open}
      >
        <span style={{ backgroundColor: value }} />
      </button>
      {open && (
        <div className="grid-caption-color-popover">
          <Picker
            color={value}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  )
}

export default GridCaptionColorPicker