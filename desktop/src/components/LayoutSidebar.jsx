import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import './Sidebar.css'
import './TabbedSidebar.css'
import './LayoutSidebar.css'

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
  // Tab props
  tabs,
  activeTabId,
  onTabChange,
  onTabAdd,
  onTabRemove,
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
  gridViewActive,
  onGridViewToggle,
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

  useEffect(() => {
    if (cellFlyout === null) return
    const handleClick = (e) => {
      if (!e.target.closest('.cell-flyout') && !e.target.closest('.sidebar-cell-add-btn')) setCellFlyout(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [cellFlyout])

  return (
    <aside className={`sidebar layout-sidebar${open ? ' sidebar-open' : ''}`}>
      {/* Tab bar */}
      <div className="tabbed-sidebar-tabs">
        {tabs.map((tab, idx) => (
          <div
            key={tab.id}
            className={`tabbed-sidebar-tab${tab.id === activeTabId ? ' active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="tabbed-sidebar-tab-label">
              {tab.label || `View ${idx + 1}`}
            </span>
            {tabs.length > 1 && (
              <button
                type="button"
                className="tabbed-sidebar-tab-close"
                onClick={(e) => { e.stopPropagation(); onTabRemove(tab.id) }}
                title="Remove view"
              >
                <Icon icon="fluent:dismiss-12-regular" width="12" height="12" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="tabbed-sidebar-tab-add"
          onClick={onTabAdd}
          title="Add new view"
        >
          <Icon icon="fluent:add-16-filled" width="14" height="14" />
        </button>
      </div>

      <div className="sidebar-header">
        <span className="sidebar-title">Layout</span>
        <button type="button" className="sidebar-close" onClick={onClose} title="Close">
          <Icon icon="fluent:dismiss-20-filled" width="18" height="18" />
        </button>
      </div>

      {/* Grid view toggle — single view vs grid view */}
      <div className="layout-grid-toggle-row">
        <span className="layout-grid-toggle-label">
          <Icon icon="fluent:grid-20-filled" width="14" height="14" />
          Grid view
        </span>
        <div
          className={`sidebar-grid-toggle${gridViewActive ? ' active' : ''}`}
          onClick={onGridViewToggle}
          title="Show the grid layout on the map"
        >
          <div className="sidebar-grid-toggle-knob" />
        </div>
      </div>

      <div className="layout-sidebar-body">
        {/* Grid Preview */}
        <div className="sidebar-grid-preview" style={{
          gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
          gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
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

        {/* Controls */}
        <div className="sidebar-grid-controls">
          <div className="sidebar-grid-control-pair">
            <div className="sidebar-grid-size-field">
              <label>Width</label>
              <div className="sidebar-grid-input-with-unit">
                <input
                  type="number"
                  className="sidebar-grid-size-input"
                  min="320"
                  step="10"
                  value={gridConfig.width}
                  onChange={e => onGridSizeChange('width', e.target.value)}
                />
                <span>px</span>
              </div>
            </div>
            <div className="sidebar-grid-size-field">
              <label>Height</label>
              <div className="sidebar-grid-input-with-unit">
                <input
                  type="number"
                  className="sidebar-grid-size-input"
                  min="240"
                  step="10"
                  value={gridConfig.height}
                  onChange={e => onGridSizeChange('height', e.target.value)}
                />
                <span>px</span>
              </div>
            </div>
          </div>
          <div className="sidebar-grid-control-pair">
            <div className="sidebar-grid-size-field">
              <label>Rows</label>
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
            <div className="sidebar-grid-size-field">
              <label>Cols</label>
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
          <div className="sidebar-grid-row">
            <label>Preset</label>
            <select className="sidebar-grid-select" value=""
              onChange={e => { if (e.target.value) { onPresetSelect(e.target.value); e.target.value = '' } }}>
              <option value="" disabled>Choose…</option>
              {Object.entries(GRID_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>{preset.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Span controls for selected cell */}
        {selectedCell !== null && gridConfig.cells[selectedCell] && (
          <div className="sidebar-grid-span-controls">
            <div className="sidebar-grid-control-pair">
              <div className="sidebar-grid-size-field">
                <label>Row span</label>
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
              <div className="sidebar-grid-size-field">
                <label>Col span</label>
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
            <button className="sidebar-grid-clear-btn" onClick={() => onClearCell(selectedCell)}>
              <Icon icon="fluent:delete-16-regular" width="12" height="12" />
              Remove from cell
            </button>
          </div>
        )}

        {/* Caption controls for selected cell */}
        {selectedCell !== null && gridConfig.cells[selectedCell] && (
          <div className="sidebar-grid-caption-controls">
            <div className="sidebar-grid-caption-header">
              <Icon icon="fluent:text-caption-20-filled" width="14" height="14" />
              <span>Caption</span>
              <div
                className={`sidebar-grid-caption-toggle${gridConfig.captions?.[selectedCell]?.visible ? ' active' : ''}`}
                onClick={() => onCaptionToggleVisible(selectedCell)}
              >
                <div className="sidebar-grid-caption-toggle-knob" />
              </div>
            </div>
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
                  <div className="sidebar-grid-caption-hint">
                    Shown as-is — each line renders on its own row. <code>%date%</code> / <code>%layer%</code> still work if you want them.
                  </div>
                </div>

                <div className="sidebar-grid-caption-field sidebar-grid-caption-row-field">
                  <label>Position</label>
                  <select
                    className="sidebar-grid-select"
                    value={gridConfig.captions?.[selectedCell]?.position || defaultCaption?.position || 'bottom-left'}
                    onChange={e => onCaptionChange(selectedCell, 'position', e.target.value)}
                  >
                    {(captionPositions || []).map(pos => (
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
                      value={gridConfig.captions?.[selectedCell]?.fontSize ?? defaultCaption?.fontSize ?? 11}
                      onChange={e => {
                        const v = Math.max(8, Math.min(72, parseInt(e.target.value) || 11))
                        onCaptionChange(selectedCell, 'fontSize', v)
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
                        value={gridConfig.captions?.[selectedCell]?.overlayColor || defaultCaption?.overlayColor || '#000000'}
                        onChange={e => onCaptionChange(selectedCell, 'overlayColor', e.target.value)}
                      />
                    </div>
                    <div className="sidebar-grid-caption-color-item">
                      <span>Text</span>
                      <input
                        type="color"
                        className="sidebar-grid-caption-color"
                        value={gridConfig.captions?.[selectedCell]?.textColor || defaultCaption?.textColor || '#ffffff'}
                        onChange={e => onCaptionChange(selectedCell, 'textColor', e.target.value)}
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
                      value={Math.round((gridConfig.captions?.[selectedCell]?.overlayOpacity ?? defaultCaption?.overlayOpacity ?? 0.55) * 100)}
                      onChange={e => {
                        const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                        onCaptionChange(selectedCell, 'overlayOpacity', v / 100)
                      }}
                    />
                    <span>%</span>
                  </div>
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
