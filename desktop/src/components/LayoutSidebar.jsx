import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import './Sidebar.css'
import './TabbedSidebar.css'
import './LayoutSidebar.css'
import GridCaptionColorPicker from './GridCaptionColorPicker'

// Grid layout presets
const GRID_PRESETS = {
  '2x2': { rows: 2, cols: 2, name: '2×2 (4 views)' },
  '1x2': { rows: 1, cols: 2, name: '1×2 (2 views)' },
  '2x1': { rows: 2, cols: 1, name: '2×1 (2 views)' },
  '2x3': { rows: 2, cols: 3, name: '2×3 (6 views)' },
  '2x4': { rows: 2, cols: 4, name: '2×4 (8 views)' },
  '3x3': { rows: 3, cols: 3, name: '3×3 (9 views)' }
}

const LayoutSidebar = ({
  open,
  onClose,
  // Tab props (only the tab list itself — the tab bar is not shown in layout mode)
  tabs,
  // Grid editor props
  gridConfig,
  selectedCell,
  onCellSelect,
  onPresetSelect,
  onDimensionChange,
  onGridSizeChange,
  onCellSpanChange,
  onAssignView,
  onClearCell,
  gridPlacement,
  // Caption props
  onCaptionChange,
  onCaptionToggleVisible,
  defaultCaption,
  captionPositions,
  onExportGrid,
}) => {
  const [cellFlyout, setCellFlyout] = useState(null) // cellIndex of open flyout, or null
  const [flyoutPos, setFlyoutPos] = useState(null) // { x, y } for portal flyout position
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)

  useEffect(() => {
    if (cellFlyout === null) return
    const handleClick = (e) => {
      if (!e.target.closest('.cell-flyout') && !e.target.closest('.sidebar-cell-add-btn')) setCellFlyout(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [cellFlyout])

  useEffect(() => {
    if (!presetMenuOpen) return
    const handleClick = (e) => {
      if (!e.target.closest('.grid-preset-menu-wrap')) setPresetMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [presetMenuOpen])

  return (
    <aside className={`sidebar layout-sidebar${open ? ' sidebar-open' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-title">Layout</span>
        <button type="button" className="sidebar-close" onClick={onClose} title="Close">
          <Icon icon="fluent:dismiss-20-filled" width="18" height="18" />
        </button>
      </div>

      <div className="layout-sidebar-body">
        {/* Controls */}
        <div className="sidebar-grid-controls">
          <div className="sidebar-grid-control-pair">
            <div className="sidebar-grid-size-field sidebar-grid-size-field--dimension">
              <div className="sidebar-grid-input-with-unit sidebar-grid-input-with-label">
                <Icon icon="fluent:auto-fit-width-20-regular" width="14" height="14" title="Width" />
                <input
                  type="number"
                  className="sidebar-grid-size-input"
                  min="320"
                  step="10"
                  value={gridConfig.width}
                  onChange={e => onGridSizeChange('width', e.target.value)}
                />
              </div>
            </div>
            <div className="sidebar-grid-size-field sidebar-grid-size-field--dimension">
              <div className="sidebar-grid-input-with-unit sidebar-grid-input-with-label">
                <Icon icon="fluent:auto-fit-height-28-regular" width="14" height="14" title="Height" />
                <input
                  type="number"
                  className="sidebar-grid-size-input"
                  min="240"
                  step="10"
                  value={gridConfig.height}
                  onChange={e => onGridSizeChange('height', e.target.value)}
                />
              </div>
            </div>
            <div className="sidebar-grid-size-field">
              <div className="sidebar-grid-input-with-unit sidebar-grid-input-with-label">
                <Icon icon="fluent:row-triple-20-filled" width="14" height="14" title="Rows" />
                <input
                  type="number"
                  className="sidebar-grid-size-input"
                  min="1"
                  max="5"
                  step="1"
                  value={gridConfig.rows}
                  onChange={e => onDimensionChange(parseInt(e.target.value) || 1, gridConfig.cols)}
                />
              </div>
            </div>
            <div className="sidebar-grid-size-field">
              <div className="sidebar-grid-input-with-unit sidebar-grid-input-with-label">
                <Icon icon="fluent:column-triple-20-filled" width="14" height="14" title="Columns" />
                <input
                  type="number"
                  className="sidebar-grid-size-input"
                  min="1"
                  max="5"
                  step="1"
                  value={gridConfig.cols}
                  onChange={e => onDimensionChange(gridConfig.rows, parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
            <div className="grid-preset-menu-wrap">
              <button
                type="button"
                className="grid-preset-menu-btn"
                onClick={() => setPresetMenuOpen(open => !open)}
                title="Choose grid preset"
                aria-label="Choose grid preset"
                aria-expanded={presetMenuOpen}
              >
                <Icon icon="fluent:chevron-down-16-filled" width="16" height="16" />
              </button>
              {presetMenuOpen && (
                <div className="grid-preset-menu">
                  {Object.entries(GRID_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      className="grid-preset-menu-item"
                      onClick={() => { onPresetSelect(key); setPresetMenuOpen(false) }}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Grid Preview */}
        <div className="sidebar-grid-preview" style={{
          gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
          gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
          aspectRatio: `${gridConfig.width} / ${gridConfig.height}`,
        }}>
          {Array.from({ length: gridConfig.rows * gridConfig.cols }).map((_, cellIndex) => {
            const cellData = gridConfig.cells[cellIndex]
            const pos = gridPlacement ? gridPlacement[cellIndex] : null
            // Skip cells that would land outside the grid (no implicit extra rows)
            if (!pos) return null
            const tab = cellData ? tabs.find(t => t.id === cellData.tabId) : null
            const isSelected = selectedCell === cellIndex
            const rowSpan = cellData?.rowSpan || 1
            const colSpan = cellData?.colSpan || 1
            return (
              <div
                key={cellIndex}
                className={`sidebar-grid-cell ${isSelected ? 'selected' : ''} ${tab ? 'has-view' : ''}`}
                style={{
                  gridRow: `${pos.row + 1} / span ${rowSpan}`,
                  gridColumn: `${pos.col + 1} / span ${colSpan}`,
                }}
                onClick={() => {
                  if (tab) {
                    onCellSelect(isSelected ? null : cellIndex)
                  }
                }}
              >
                {tab ? (
                  <span className="sidebar-grid-cell-label">{tab.label}</span>
                ) : (
                  <div className="sidebar-cell-add-wrap">
                    <button
                      type="button"
                      className="sidebar-cell-add-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        setFlyoutPos({ x: rect.left + rect.width / 2, y: rect.top })
                        setCellFlyout(cellFlyout === cellIndex ? null : cellIndex)
                        onCellSelect(cellIndex)
                      }}
                    >
                      <Icon icon="fluent:add-16-filled" width="12" height="12" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Span controls for selected cell */}
        {selectedCell !== null && gridConfig.cells[selectedCell] && (
          <div className="sidebar-grid-span-controls">
            <div className="sidebar-grid-control-pair">
              <div className="sidebar-grid-caption-toggle-control">
                <Icon icon="fluent:text-caption-20-filled" width="14" height="14" title="Caption" />
                <span>Caption</span>
                <div
                  className={`sidebar-grid-caption-toggle${gridConfig.captions?.[selectedCell]?.visible ? ' active' : ''}`}
                  onClick={() => onCaptionToggleVisible(selectedCell)}
                  role="switch"
                  aria-checked={Boolean(gridConfig.captions?.[selectedCell]?.visible)}
                  aria-label="Show caption"
                >
                  <div className="sidebar-grid-caption-toggle-knob" />
                </div>
              </div>
              <div className="sidebar-grid-size-field">
                <div className="sidebar-grid-input-with-unit sidebar-grid-input-with-label">
                  <Icon icon="fluent:row-triple-20-filled" width="14" height="14" title="Row span" />
                  <input
                    type="number"
                    className="sidebar-grid-size-input"
                    min="1"
                    max="5"
                    step="1"
                    value={gridConfig.cells[selectedCell]?.rowSpan || 1}
                    onChange={e => onCellSpanChange(selectedCell, Math.max(1, Math.min(5, parseInt(e.target.value) || 1)), gridConfig.cells[selectedCell]?.colSpan || 1)}
                  />
                </div>
              </div>
              <div className="sidebar-grid-size-field">
                <div className="sidebar-grid-input-with-unit sidebar-grid-input-with-label">
                  <Icon icon="fluent:column-triple-20-filled" width="14" height="14" title="Column span" />
                  <input
                    type="number"
                    className="sidebar-grid-size-input"
                    min="1"
                    max="5"
                    step="1"
                    value={gridConfig.cells[selectedCell]?.colSpan || 1}
                    onChange={e => onCellSpanChange(selectedCell, gridConfig.cells[selectedCell]?.rowSpan || 1, Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                  />
                </div>
              </div>
              <button
                type="button"
                className="sidebar-grid-cell-delete-btn"
                onClick={() => onClearCell(selectedCell)}
                title="Remove from cell"
                aria-label="Remove from cell"
              >
                <Icon icon="fluent:dismiss-16-regular" width="16" height="16" />
              </button>
            </div>
          </div>
        )}

        {/* Caption controls for selected cell */}
        {selectedCell !== null && gridConfig.cells[selectedCell] && (
          <div className="sidebar-grid-caption-controls">
            {gridConfig.captions?.[selectedCell]?.visible && (
              <div className="sidebar-grid-caption-fields">
                <div className="sidebar-grid-caption-textarea-wrap">
                  <textarea
                    className="sidebar-grid-caption-textarea"
                    value={gridConfig.captions?.[selectedCell]?.text || defaultCaption?.text || ''}
                    onChange={e => onCaptionChange(selectedCell, 'text', e.target.value)}
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

                <div className="grid-caption-compact-row">
                  <div className="grid-caption-compact-control grid-caption-compact-control--position">
                    <Icon icon="fluent:text-align-left-20-filled" width="14" height="14" title="Caption position" />
                    <select
                      className="sidebar-grid-select"
                      value={gridConfig.captions?.[selectedCell]?.position || defaultCaption?.position || 'bottom-left'}
                      onChange={e => onCaptionChange(selectedCell, 'position', e.target.value)}
                      aria-label="Caption position"
                    >
                      {(captionPositions || []).map(pos => (
                        <option key={pos.value} value={pos.value}>{pos.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid-caption-compact-control">
                    <Icon icon="fluent:text-font-size-20-filled" width="14" height="14" title="Caption font size" />
                    <input
                      type="number"
                      className="sidebar-grid-size-input"
                      min="8"
                      max="72"
                      step="1"
                      value={gridConfig.captions?.[selectedCell]?.fontSize ?? defaultCaption?.fontSize ?? 11}
                      onChange={e => {
                        const v = Math.max(8, Math.min(72, parseInt(e.target.value) || 11))
                        onCaptionChange(selectedCell, 'fontSize', v)
                      }}
                      aria-label="Caption font size"
                    />
                  </div>
                </div>

                <div className="grid-caption-compact-row">
                  <div className="grid-caption-color-control">
                    <GridCaptionColorPicker
                      color={gridConfig.captions?.[selectedCell]?.overlayColor || defaultCaption?.overlayColor || '#000000'}
                      opacity={gridConfig.captions?.[selectedCell]?.overlayOpacity ?? defaultCaption?.overlayOpacity ?? 0.55}
                      icon="fluent:paint-brush-20-filled"
                      title="Choose caption overlay color and alpha"
                      withAlpha
                      onChange={(overlayColor) => onCaptionChange(selectedCell, { overlayColor, overlayOpacity: 1 })}
                    />
                  </div>
                  <div className="grid-caption-color-control">
                    <GridCaptionColorPicker
                      color={gridConfig.captions?.[selectedCell]?.textColor || defaultCaption?.textColor || '#ffffff'}
                      icon="fluent:text-color-20-filled"
                      title="Choose caption text color"
                      onChange={(textColor) => onCaptionChange(selectedCell, 'textColor', textColor)}
                    />
                  </div>
                  <button
                    type="button"
                    className="grid-caption-color-reset"
                    onClick={() => onCaptionChange(selectedCell, {
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

        {/* Export grid button */}
        {onExportGrid && Object.keys(gridConfig.cells).length > 0 && (
          <button type="button" className="sidebar-export-btn sidebar-export-btn--grid" onClick={onExportGrid}>
            <Icon icon="fluent:image-arrow-download-20-regular" width="14" height="14" />
            Export Image
          </button>
        )}
      </div>

      {/* Cell flyout portal — rendered outside overflow containers */}
      {cellFlyout !== null && flyoutPos && (
        createPortal(
          <div
            className="cell-flyout"
            style={{
              position: 'fixed',
              left: flyoutPos.x,
              top: flyoutPos.y,
              transform: 'translate(-50%, -100%)',
              marginBottom: 8,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {tabs.map(tab => {
              const isAssigned = Object.values(gridConfig.cells).some(c => c.tabId === tab.id)
              return (
                <button
                  key={tab.id}
                  type="button"
                  className="cell-flyout-item"
                  onClick={() => {
                    onAssignView(cellFlyout, tab.id)
                    setCellFlyout(null)
                  }}
                >
                  <span className="cell-flyout-name">{tab.label}</span>
                  {isAssigned && <span className="cell-flyout-sub">already assigned</span>}
                </button>
              )
            })}
          </div>,
          document.body
        )
      )}
    </aside>
  )
}

export default LayoutSidebar
