import { useRef } from 'react'
import { Icon } from '@iconify/react'
import GridCaptionColorPicker from './GridCaptionColorPicker'
import './TimelapseFramesPanel.css'

// Right-hand panel of the timelapse workbench: the selected frames
// (reorder / remove / per-frame delay + caption) and the GIF export.
const TimelapseFramesPanel = ({
  hasLayers,
  hasRect,
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
}) => {
  const dragIndexRef = useRef(null)

  const canExport = hasLayers && hasRect && frames.length >= 2 && !exporting
  const selectedFrame = frames.find(f => f.time === selectedFrameTime) || null

  const cycleCaptionPosition = (time) => {
    const positions = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
    const frame = frames.find(f => f.time === time)
    const current = frame?.caption?.position || 'bottom-left'
    const next = positions[(positions.indexOf(current) + 1) % positions.length]
    onCaptionChange(time, { position: next })
  }

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
    <aside className="timelapse-frames-panel">
      <div className="timelapse-frames-panel-header">
        <span className="timelapse-frames-panel-title">Frames &amp; Export</span>
      </div>

      <div className="timelapse-frames-panel-scroll">
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
            <div className="timelapse-hint">Select images in the left panel, then click “Add selected”.</div>
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

              <div className="timelapse-frame-editor-row">
                <div className="sidebar-grid-caption-toggle-control timelapse-frame-delay-control">
                  <span>Delay</span>
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
                <div className="sidebar-grid-caption-toggle-control">
                  <Icon icon="fluent:text-caption-20-filled" width="14" height="14" title="Caption" />
                  <span>Caption</span>
                  <div
                    className={`sidebar-grid-caption-toggle${selectedFrame.caption?.visible ? ' active' : ''}`}
                    onClick={() => onCaptionChange(selectedFrame.time, { visible: !selectedFrame.caption?.visible })}
                    role="switch"
                    aria-checked={Boolean(selectedFrame.caption?.visible)}
                    aria-label="Show caption"
                  >
                    <div className="sidebar-grid-caption-toggle-knob" />
                  </div>
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
                      <Icon
                        icon="fluent:question-circle-20-filled"
                        width="14"
                        height="14"
                        className="grid-caption-help-icon"
                        title="Shown as-is: each line renders on its own row. %date% and %layer% remain available."
                      />
                    </div>

                    <div className="grid-caption-compact-row grid-caption-control-row">
                      <button
                        type="button"
                        className="grid-caption-position-cycle"
                        onClick={() => cycleCaptionPosition(selectedFrame.time)}
                        title="Move caption to the next corner"
                        aria-label="Move caption to the next corner"
                      >
                        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(position => (
                          <span
                            key={position}
                            className={selectedFrame.caption.position === position ? 'active' : ''}
                          />
                        ))}
                      </button>
                      <div className="grid-caption-compact-control">
                        <Icon icon="fluent:text-font-size-20-filled" width="14" height="14" title="Caption font size" />
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
                          aria-label="Caption font size"
                        />
                      </div>
                      <div className="grid-caption-color-control">
                        <GridCaptionColorPicker
                          color={selectedFrame.caption.overlayColor || '#000000'}
                          opacity={selectedFrame.caption.overlayOpacity ?? 0.55}
                          icon="fluent:paint-brush-20-filled"
                          title="Choose caption overlay color and alpha"
                          withAlpha
                          onChange={(overlayColor) => onCaptionChange(selectedFrame.time, { overlayColor, overlayOpacity: 1 })}
                        />
                      </div>
                      <div className="grid-caption-color-control">
                        <GridCaptionColorPicker
                          color={selectedFrame.caption.textColor || '#ffffff'}
                          icon="fluent:text-color-20-filled"
                          title="Choose caption text color"
                          onChange={(textColor) => onCaptionChange(selectedFrame.time, { textColor })}
                        />
                      </div>
                      <button
                        type="button"
                        className="grid-caption-color-reset"
                        onClick={() => onCaptionChange(selectedFrame.time, {
                          overlayColor: '#000000',
                          overlayOpacity: 0.55,
                          textColor: '#ffffff',
                        })}
                        title="Reset colors to black and white"
                        aria-label="Reset colors to black and white"
                      >
                        <Icon icon="fluent:arrow-reset-20-regular" width="16" height="16" />
                      </button>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Export */}
        <div className="timelapse-section">
          <label className="timelapse-check-row timelapse-stamp-toggle">
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

export default TimelapseFramesPanel