import { useRef } from 'react'
import { Icon } from '@iconify/react'
import DatePicker from './DatePicker'
import './TimelapsePanel.css'

const INTERVALS = [
  { value: 1, label: 'Every day' },
  { value: 3, label: 'Every 3 days' },
  { value: 7, label: 'Every 7 days' },
  { value: 30, label: 'Every 30 days' },
]

const PRESETS = [
  { id: '16:9', ratio: 16 / 9, label: '16:9' },
  { id: '1:1', ratio: 1, label: '1:1' },
  { id: 'freeform', ratio: null, label: 'Freeform' },
]

// Same positions as the grid-view captions.
const CAPTION_POSITIONS = [
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
]

const TimelapsePanel = ({
  layerName,
  hasLayer,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  interval,
  onIntervalChange,
  aspect,
  onApplyPreset,
  onResetRect,
  hasRect,
  rect,
  availableCount,
  frames,
  onRemoveFrame,
  onRemoveAllFrames,
  onReorderFrames,
  selectedFrameTime,
  onSelectFrame,
  onCaptionChange,
  onFrameDelayChange,
  defaultDelay,
  stampDates,
  onStampDatesChange,
  exporting,
  progress,
  onExport,
  onClose,
}) => {
  const dragIndexRef = useRef(null)

  const canExport = hasLayer && hasRect && frames.length >= 2 && !exporting
  const selectedFrame = frames.find(f => f.time === selectedFrameTime) || null

  const handleDragStart = (i) => (e) => {
    dragIndexRef.current = i
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (target) => (e) => {
    e.preventDefault()
    const from = dragIndexRef.current
    dragIndexRef.current = null
    if (from === null || from === target) return
    const next = [...frames]
    const [moved] = next.splice(from, 1)
    next.splice(target, 0, moved)
    onReorderFrames(next)
  }

  return (
    <aside className="timelapse-panel">
      <div className="timelapse-panel-header">
        <span className="timelapse-panel-title">Timelapse GIF</span>
        <button type="button" className="timelapse-panel-close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div className="timelapse-panel-scroll">
        {/* Layer */}
        <div className="timelapse-section">
          <div className="timelapse-section-title">Layer</div>
          <div className="timelapse-layer-name">{layerName || 'No imagery layer active'}</div>
          {!hasLayer && (
            <div className="timelapse-hint">Add an imagery layer (e.g. True Color) via the Layers tool to export a timelapse.</div>
          )}
        </div>

        {/* Period */}
        <div className="timelapse-section">
          <div className="timelapse-section-title">Period</div>
          <div className="timelapse-date-row">
            <label className="timelapse-date-label">Start</label>
            <DatePicker selectedDate={startDate} onDateChange={onStartDateChange} startYear={2000} />
          </div>
          <div className="timelapse-date-row">
            <label className="timelapse-date-label">End</label>
            <DatePicker selectedDate={endDate} onDateChange={onEndDateChange} />
          </div>
          <div className="timelapse-interval-row">
            <label className="timelapse-date-label">Interval</label>
            <select
              className="sidebar-grid-select"
              value={interval}
              onChange={(e) => onIntervalChange(parseInt(e.target.value, 10))}
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>
          {availableCount > 0 && (
            <div className="timelapse-count">{availableCount} images in range</div>
          )}
        </div>

        {/* Area */}
        <div className="timelapse-section">
          <div className="timelapse-section-title">Area</div>
          <div className="timelapse-preset-btns">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`timelapse-preset-btn${(p.ratio === null ? aspect === null : p.ratio === aspect) ? ' active' : ''}`}
                onClick={() => onApplyPreset(p.ratio)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" className="timelapse-reset-btn" onClick={onResetRect}>
            Reset box to view
          </button>
          {hasRect && rect && (
            <div className="timelapse-rect-info">
              SW: {rect[0][1].toFixed(3)}, {rect[0][0].toFixed(3)}
              <br />
              NE: {rect[1][1].toFixed(3)}, {rect[1][0].toFixed(3)}
            </div>
          )}
        </div>

        {/* Frames */}
        <div className="timelapse-section">
          <div className="timelapse-section-row">
            <div className="timelapse-section-title">Frames ({frames.length})</div>
            {frames.length > 0 && (
              <button
                type="button"
                className="timelapse-clear-all-btn"
                onClick={onRemoveAllFrames}
                title="Remove all frames"
              >
                Clear all
              </button>
            )}
          </div>
          {frames.length === 0 ? (
            <div className="timelapse-hint">Select images in the right panel, then click “Add selected”.</div>
          ) : (
            <div className="timelapse-frames">
              {frames.map((frame, i) => (
                <div
                  key={`${frame.time}-${i}`}
                  className={`timelapse-frame-row${frame.time === selectedFrameTime ? ' selected' : ''}`}
                  draggable={!exporting}
                  onClick={() => onSelectFrame(frame.time)}
                  onDragStart={handleDragStart(i)}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop(i)}
                >
                  <span className="layer-drag-handle">
                    <Icon icon="fluent:reorder-20-filled" width="16" height="16" />
                  </span>
                  <span className="timelapse-frame-date">{frame.label}</span>
                  {frame.delay != null && frame.delay !== defaultDelay && <span className="timelapse-frame-delay-badge">{frame.delay}s</span>}
                  <button
                    type="button"
                    className="timelapse-frame-remove"
                    onClick={(e) => { e.stopPropagation(); onRemoveFrame(i) }}
                    title="Remove frame"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Frame editor — caption + per-frame delay, same look as grid view */}
          {selectedFrame && (
            <div className="timelapse-frame-editor">
              <div className="timelapse-frame-editor-header">
                <span>Frame · {selectedFrame.label}</span>
                <button
                  type="button"
                  className="timelapse-frame-editor-close"
                  onClick={() => onSelectFrame(selectedFrame.time)}
                  title="Close"
                >
                  ✕
                </button>
              </div>

              <div className="sidebar-grid-caption-field sidebar-grid-caption-row-field">
                <label>Delay</label>
                <div className="sidebar-grid-input-with-unit">
                  <input
                    type="number"
                    className="sidebar-grid-size-input"
                    min="0.1"
                    max="60"
                    step="0.1"
                    value={selectedFrame.delay ?? defaultDelay}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      onFrameDelayChange(selectedFrame.time, Number.isFinite(v) && v > 0 ? v : null)
                    }}
                    disabled={exporting}
                  />
                  <span>s</span>
                </div>
              </div>

              <div className="sidebar-grid-caption-controls">
                <div className="sidebar-grid-caption-header">
                  <Icon icon="fluent:text-caption-20-filled" width="14" height="14" />
                  <span>Caption</span>
                  <div
                    className={`sidebar-grid-caption-toggle${selectedFrame.caption?.visible ? ' active' : ''}`}
                    onClick={() => onCaptionChange(selectedFrame.time, { visible: !selectedFrame.caption?.visible })}
                  >
                    <div className="sidebar-grid-caption-toggle-knob" />
                  </div>
                </div>
                {selectedFrame.caption?.visible && (
                  <div className="sidebar-grid-caption-fields">
                    <div className="sidebar-grid-caption-textarea-wrap">
                      <textarea
                        className="sidebar-grid-caption-textarea"
                        value={selectedFrame.caption.text || ''}
                        onChange={(e) => onCaptionChange(selectedFrame.time, { text: e.target.value })}
                        rows={3}
                        placeholder="%date%  %layer%"
                      />
                      <div className="sidebar-grid-caption-hint">
                        Shown as-is — each line renders on its own row. <code>%date%</code> / <code>%layer%</code> still work if you want them.
                      </div>
                    </div>

                    <div className="sidebar-grid-caption-field sidebar-grid-caption-row-field">
                      <label>Position</label>
                      <select
                        className="sidebar-grid-select"
                        value={selectedFrame.caption.position || 'bottom-left'}
                        onChange={(e) => onCaptionChange(selectedFrame.time, { position: e.target.value })}
                      >
                        {CAPTION_POSITIONS.map(pos => (
                          <option key={pos.value} value={pos.value}>{pos.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="sidebar-grid-caption-field sidebar-grid-caption-row-field">
                      <label>Font size</label>
                      <div className="sidebar-grid-input-with-unit">
                        <input
                          type="number"
                          className="sidebar-grid-size-input"
                          min="8"
                          max="72"
                          step="1"
                          value={selectedFrame.caption.fontSize ?? 11}
                          onChange={(e) => {
                            const v = Math.max(8, Math.min(72, parseInt(e.target.value) || 11))
                            onCaptionChange(selectedFrame.time, { fontSize: v })
                          }}
                        />
                        <span>px</span>
                      </div>
                    </div>

                    <div className="sidebar-grid-caption-field sidebar-grid-caption-row-field">
                      <label>Colors</label>
                      <div className="sidebar-grid-caption-color-row">
                        <div className="sidebar-grid-caption-color-item">
                          <span>Overlay</span>
                          <input
                            type="color"
                            className="sidebar-grid-caption-color"
                            value={selectedFrame.caption.overlayColor || '#000000'}
                            onChange={(e) => onCaptionChange(selectedFrame.time, { overlayColor: e.target.value })}
                          />
                        </div>
                        <div className="sidebar-grid-caption-color-item">
                          <span>Text</span>
                          <input
                            type="color"
                            className="sidebar-grid-caption-color"
                            value={selectedFrame.caption.textColor || '#ffffff'}
                            onChange={(e) => onCaptionChange(selectedFrame.time, { textColor: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="sidebar-grid-caption-field sidebar-grid-caption-row-field">
                      <label>Opacity</label>
                      <div className="sidebar-grid-caption-opacity-row">
                        <input
                          type="number"
                          className="sidebar-grid-size-input sidebar-grid-caption-opacity-input"
                          min="0"
                          max="100"
                          step="5"
                          value={Math.round((selectedFrame.caption.overlayOpacity ?? 0.55) * 100)}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                            onCaptionChange(selectedFrame.time, { overlayOpacity: v / 100 })
                          }}
                        />
                        <span>%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Export */}
        <div className="timelapse-section">
          <div className="timelapse-section-title">Export</div>
          <label className="timelapse-check-row">
            <input
              type="checkbox"
              checked={stampDates}
              onChange={(e) => onStampDatesChange(e.target.checked)}
              disabled={exporting}
            />
            <span>Stamp date on frames without a caption</span>
          </label>
          <button type="button" className="timelapse-export-btn" onClick={onExport} disabled={!canExport}>
            {exporting
              ? (progress ? `Exporting ${progress.done}/${progress.total}…` : 'Exporting…')
              : `Export GIF (${frames.length} frames)`}
          </button>
          {!hasRect && <div className="timelapse-hint">Draw a crop box on the map first.</div>}
          {hasRect && frames.length < 2 && <div className="timelapse-hint">Add at least 2 frames.</div>}
        </div>
      </div>
    </aside>
  )
}

export default TimelapsePanel