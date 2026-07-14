import React, { useState, useRef } from 'react'
import DatePicker from './DatePicker'
import './TimelapsePanel.css'

const PRESETS = [
  { id: '16:9', label: '16:9' },
  { id: '1:1', label: '1:1' },
  { id: 'freeform', label: 'Freeform' },
]

const TimelapsePanel = ({
  config,
  selectedLayer,
  selectedDate,
  onDateChange,
  onAddFrame,
  onRemoveFrame,
  onReorder,
  onExport,
  frames,
  rectangle,
  onApplyPreset,
  isExporting,
  delay,
  onDelayChange
}) => {
  const [newFrameDate, setNewFrameDate] = useState(selectedDate)
  const [activePreset, setActivePreset] = useState('freeform')
  const dragIndexRef = useRef(null)

  const handlePreset = (preset) => {
    setActivePreset(preset)
    onApplyPreset(preset)
  }

  const handleAddFrame = () => {
    if (rectangle) {
      onAddFrame(newFrameDate, rectangle)
      setNewFrameDate(selectedDate)
    }
  }

  const handleDragStart = (i) => (e) => {
    dragIndexRef.current = i
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', i)
  }

  const handleDragOver = (i) => (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (targetIndex) => (e) => {
    e.preventDefault()
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === targetIndex) return
    const reordered = [...frames]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    onReorder(reordered)
    dragIndexRef.current = null
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
  }

  return (
    <div className="timelapse-panel">
      <div className="timelapse-panel-header">Timelapse</div>

      <div className="timelapse-section">
        <div className="timelapse-section-title">Area</div>
        <div className="timelapse-preset-btns">
          {PRESETS.map(p => (
            <button
              key={p.id}
              className={`timelapse-preset-btn${activePreset === p.id ? ' active' : ''}`}
              onClick={() => handlePreset(p.id)}
              disabled={isExporting}
            >
              {p.label}
            </button>
          ))}
        </div>
        {rectangle ? (
          <div className="timelapse-rect-info">
            <div className="timelapse-rect-coords">
              SW: {rectangle[0][1].toFixed(4)}, {rectangle[0][0].toFixed(4)}
            </div>
            <div className="timelapse-rect-coords">
              NE: {rectangle[1][1].toFixed(4)}, {rectangle[1][0].toFixed(4)}
            </div>
            <button className="timelapse-clear-rect" onClick={() => { setActivePreset('freeform'); onApplyPreset('freeform') }} disabled={isExporting}>
              Clear
            </button>
          </div>
        ) : (
          <div className="timelapse-no-rect">
            {activePreset === 'freeform'
              ? 'Draw a rectangle on the map to define the export area'
              : 'Click a preset to place a rectangle on the map'}
          </div>
        )}
      </div>

      <div className="timelapse-section">
        <div className="timelapse-section-title">Frames</div>
        <div className="timelapse-frames">
          {frames.map((frame, i) => (
            <div
              key={i}
              className="timelapse-frame-row"
              draggable={!isExporting}
              onDragStart={handleDragStart(i)}
              onDragOver={handleDragOver(i)}
              onDrop={handleDrop(i)}
              onDragEnd={handleDragEnd}
            >
              <span className="timelapse-frame-grip">⋮⋮</span>
              <span className="timelapse-frame-date">{frame.date}</span>
              <button className="timelapse-frame-remove" onClick={() => onRemoveFrame(i)} title="Remove frame">
                ✕
              </button>
            </div>
          ))}
          {frames.length === 0 && (
            <div className="timelapse-no-frames">No frames added yet</div>
          )}
        </div>
      </div>

      <div className="timelapse-section">
        <div className="timelapse-section-title">Add Frame</div>
        <div className="timelapse-add-frame">
          <div className="timelapse-date-row">
            <label className="timelapse-date-label">Date</label>
            <DatePicker
              selectedDate={newFrameDate}
              onDateChange={setNewFrameDate}
            />
          </div>
          <button className="timelapse-add-btn" onClick={handleAddFrame} disabled={!rectangle || isExporting}>
            + Add Frame
          </button>
        </div>
      </div>

      <div className="timelapse-section">
        <div className="timelapse-section-title">Frame Delay</div>
        <div className="timelapse-delay-row">
          <input
            type="number"
            className="timelapse-delay-input"
            value={delay}
            min="0.1"
            max="60"
            step="0.1"
            onChange={(e) => onDelayChange(parseFloat(e.target.value) || 1)}
            disabled={isExporting}
          />
          <span className="timelapse-delay-label">seconds per frame</span>
        </div>
      </div>

      <button className="timelapse-export-btn" onClick={onExport} disabled={frames.length < 2 || isExporting}>
        {isExporting ? 'Exporting...' : 'Export GIF'}
      </button>
    </div>
  )
}

export default TimelapsePanel