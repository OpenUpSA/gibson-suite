import { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import './Sidebar.css'
import './TabbedSidebar.css'
import DatePicker from './DatePicker'

const QUALITY_ORDER = ['low', 'medium', 'high']

// Grid layout presets
const GRID_PRESETS = {
  '2x2': { rows: 2, cols: 2, name: '2×2 (4 views)' },
  '1x2': { rows: 1, cols: 2, name: '1×2 (2 views)' },
  '2x1': { rows: 2, cols: 1, name: '2×1 (2 views)' },
  '2x3': { rows: 2, cols: 3, name: '2×3 (6 views)' },
  '2x4': { rows: 2, cols: 4, name: '2×4 (8 views)' },
  '3x3': { rows: 3, cols: 3, name: '3×3 (9 views)' }
}

const TabbedSidebar = ({
  sections,
  layerById,
  layerSection,
  layerSettings,
  hiddenLayers,
  layerCatalog,
  onRemove,
  onReorder,
  onSettingsChange,
  onToggleVisibility,
  onQuickAdd,
  onAddClick,
  open,
  onClose,
  // Tab-specific props
  tabs,
  activeTabId,
  onTabChange,
  onTabAdd,
  onTabRemove,
  activeTabDate,
  onTabDateChange,
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
  onExportTab,
  onExportGrid,
}) => {
  const [expandedId, setExpandedId] = useState(null)
  const [infoLayerId, setInfoLayerId] = useState(null)
  const [flyoutSection, setFlyoutSection] = useState(null)
  const [cellFlyout, setCellFlyout] = useState(null) // cellIndex of open flyout, or null
  const [flyoutPos, setFlyoutPos] = useState(null) // { x, y } for portal flyout position
  const contentRef = useRef(null)
  const topPanelRef = useRef(null)
  const bottomPanelRef = useRef(null)
  const [topFlex, setTopFlex] = useState(null) // null = auto (1fr), number = explicit px
  const [bottomHeight, setBottomHeight] = useState(200)
  const [isResizing, setIsResizing] = useState(false)

  // ── Panel resize (drag handle) ──────────────────────────────────────
  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startBottom = bottomPanelRef.current?.getBoundingClientRect().height || 200

    const onMove = (ev) => {
      const dy = startY - ev.clientY
      // Minimum = header height (~36px) so the user can always drag it back
      const newBottom = Math.max(36, startBottom + dy)
      setBottomHeight(newBottom)
      setTopFlex(1) // switch top to flex:1 so it shares space
    }
    const onUp = () => {
      setIsResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [bottomHeight])

  // When grid opens, default to 2/3 of sidebar height
  useEffect(() => {
    if (!gridViewActive) return
    const sidebarEl = document.querySelector('.sidebar')
    if (!sidebarEl) return
    const rect = sidebarEl.getBoundingClientRect()
    // Subtract header (~44px) + date picker (~40px) + tab bar (~40px) + grid header (~36px)
    const available = rect.height - 160
    setBottomHeight(Math.round(available * 2 / 3))
    setTopFlex(1)
  }, [gridViewActive])

  // ── Sortable-style drag-and-drop ──────────────────────────────────────
  const [dragIndex, setDragIndex] = useState(null)
  const [dragSection, setDragSection] = useState(null)
  const [ghost, setGhost] = useState(null)
  const lastSwapFrom = useRef(null)
  const swapping = useRef(false)

  useEffect(() => {
    if (!open && dragIndex !== null) cancelDrag()
  }, [open])

  const cancelDrag = useCallback(() => {
    setDragIndex(null)
    setDragSection(null)
    setGhost(null)
    lastSwapFrom.current = null
    swapping.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.body.classList.remove('sidebar-dragging')
  }, [])

  const finishDrag = useCallback(() => {
    if (dragIndex === null || !dragSection) { cancelDrag(); return }
    const section = sections.find(s => s.key === dragSection)
    if (section) onReorder(dragSection, [...section.ids])
    cancelDrag()
  }, [dragIndex, dragSection, sections, onReorder, cancelDrag])

  useEffect(() => {
    if (dragIndex === null) return

    const onMouseMove = (e) => {
      setGhost(prev => prev ? { ...prev, x: e.clientX + 16, y: e.clientY + 16 } : null)

      if (swapping.current) return

      const content = contentRef.current
      if (!content) return

      const bounds = content.getBoundingClientRect()
      const cy = Math.max(bounds.top, Math.min(e.clientY, bounds.bottom - 1))

      const under = document.elementFromPoint(e.clientX, cy)
      if (!under) return
      const targetRow = under.closest('.layer-row[data-section]')
      if (!targetRow || targetRow.dataset.section !== dragSection) return

      const rows = Array.from(
        content.querySelectorAll(`.layer-row[data-section="${dragSection}"]`)
      )
      const targetIdx = rows.indexOf(targetRow)
      if (targetIdx === -1 || targetIdx === dragIndex) return

      const rect = targetRow.getBoundingClientRect()
      const pastMid = cy > rect.top + rect.height / 2

      let doSwap = false
      if (pastMid && targetIdx > dragIndex && lastSwapFrom.current !== targetIdx) {
        doSwap = true
      } else if (!pastMid && targetIdx < dragIndex && lastSwapFrom.current !== targetIdx) {
        doSwap = true
      }

      if (doSwap) {
        swapping.current = true
        const ids = [...sections.find(s => s.key === dragSection).ids]
        const [moved] = ids.splice(dragIndex, 1)
        ids.splice(targetIdx, 0, moved)
        lastSwapFrom.current = dragIndex
        setDragIndex(targetIdx)
        onReorder(dragSection, ids)
        requestAnimationFrame(() => { swapping.current = false })
      }
    }

    const onMouseUp = () => finishDrag()

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragIndex, dragSection, sections, onReorder, finishDrag])

  const handleDragStart = useCallback((e, id, section, index) => {
    e.preventDefault()
    e.stopPropagation()
    const row = e.currentTarget.closest('.layer-row')
    if (row) {
      const clone = row.cloneNode(true)
      clone.className = 'layer-row-ghost'
      clone.style.width = `${row.offsetWidth}px`
      setGhost({ x: e.clientX + 16, y: e.clientY + 16, html: clone.outerHTML })
      requestAnimationFrame(() => clone.remove())
    }
    lastSwapFrom.current = null
    swapping.current = false
    setDragIndex(index)
    setDragSection(section)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    document.body.classList.add('sidebar-dragging')
  }, [])

  useEffect(() => {
    if (!flyoutSection) return
    const handleClick = (e) => {
      if (!e.target.closest('.sidebar-add-wrap')) setFlyoutSection(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [flyoutSection])

  useEffect(() => {
    if (cellFlyout === null) return
    const handleClick = (e) => {
      if (!e.target.closest('.cell-flyout') && !e.target.closest('.sidebar-cell-add-btn')) setCellFlyout(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [cellFlyout])

  const totalActive = sections.reduce((n, s) => n + s.ids.length, 0)

  // Get the active tab
  const activeTab = tabs.find(t => t.id === activeTabId)

  return (
    <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
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
        <span className="sidebar-title">
          {activeTab?.label || `View ${tabs.findIndex(t => t.id === activeTabId) + 1}`}
        </span>
        <button type="button" className="sidebar-close" onClick={onClose} title="Close">
          <Icon icon="fluent:dismiss-20-filled" width="18" height="18" />
        </button>
      </div>

      {/* Date picker for current tab */}
      <div className="sidebar-date-picker">
        <DatePicker
          selectedDate={activeTabDate}
          onDateChange={onTabDateChange}
        />
      </div>

      <div
        className={`sidebar-top-panel${isResizing ? ' resizing' : ''}`}
        ref={topPanelRef}
        style={topFlex !== null ? { flex: 1, minHeight: 0 } : undefined}
      >

        {totalActive === 0 && (
          <div className="sidebar-empty">No layers on the map yet.</div>
        )}

        {sections.map((section, sectionIdx) => {
              const availableLayers = (layerCatalog || []).filter(
                l => (l.section || (l.role === 'base' ? 'base' : 'reference')) === section.key
                  && !section.ids.includes(l.id)
              )
              if (!section.ids.length && !availableLayers.length) {
                if (section.key === 'imagery') {
                  return (
                    <div key={section.key} className="sidebar-section">
                      <div className="sidebar-add-layer-row">
                        <button type="button" className="add-layer-btn" onClick={onAddClick}>
                          <Icon icon="fluent:add-20-filled" width="16" height="16" />
                          Add Layer
                        </button>
                      </div>
                    </div>
                  )
                }
                return null
              }
              return (
                <>
                <div key={section.key} className="sidebar-section">
                  <div className="sidebar-section-title-row">
                    <span className="sidebar-section-title">{section.title}</span>
                    {availableLayers.length > 0 && (
                      <div className="sidebar-add-wrap">
                        <button
                          type="button"
                          className="sidebar-add-btn"
                          onClick={() => setFlyoutSection(flyoutSection === section.key ? null : section.key)}
                          title={`Add ${section.title}`}
                        >
                          <Icon icon="fluent:add-16-filled" width="14" height="14" />
                        </button>
                        {flyoutSection === section.key && (
                          <div className="sidebar-flyout">
                            {availableLayers.map(layer => (
                              <button
                                key={layer.id}
                                type="button"
                                className="sidebar-flyout-item"
                                onClick={() => { onQuickAdd(layer); setFlyoutSection(null) }}
                                title={layer.description || layer.name}
                              >
                                <span className="sidebar-flyout-name">{layer.name}</span>
                                {layer.subtitle && <span className="sidebar-flyout-sub">{layer.subtitle}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {section.key === 'imagery' && (
                    <div className="sidebar-add-layer-row">
                      <button type="button" className="add-layer-btn" onClick={onAddClick}>
                        <Icon icon="fluent:add-20-filled" width="16" height="16" />
                        Add Layer
                      </button>
                    </div>
                  )}
                  {section.ids.map((id, index) => {
                    const layer = layerById.get(id)
                    if (!layer) return null
                    const isImagery = layerSection(layer) === 'imagery'
                    const expanded = expandedId === id && isImagery
                    const settings = layerSettings[id] ?? { quality: 'low', opacity: 1 }
                    const isDragging = dragIndex === index && dragSection === section.key
                    const isHidden = hiddenLayers?.has(id)
                    return (
                      <div
                        key={id}
                        className={`layer-row${expanded ? ' expanded' : ''}${isDragging ? ' dragging' : ''}`}
                        data-section={section.key}
                      >
                        <div className="layer-row-top">
                          <span
                            className="layer-drag-handle"
                            onMouseDown={(e) => handleDragStart(e, id, section.key, index)}
                            title="Drag to reorder"
                          >
                            <Icon icon="fluent:reorder-20-filled" width="16" height="16" />
                          </span>
                          <span className="layer-row-name">
                            <span className="layer-row-title">{layer.name}</span>
                            {layer.subtitle && (
                              <span className="layer-row-subtitle">{layer.subtitle}</span>
                            )}
                          </span>
                          <button
                            type="button"
                            className={`layer-icon-btn${isHidden ? ' muted' : ''}`}
                            onClick={() => onToggleVisibility(id)}
                            title={isHidden ? 'Show layer' : 'Hide layer'}
                          >
                            <Icon icon={isHidden ? 'fluent:eye-off-20-regular' : 'fluent:eye-20-regular'} width="16" height="16" />
                          </button>
                          {isImagery && (
                            <button
                              type="button"
                              className={`layer-icon-btn${expanded ? ' active' : ''}`}
                              onClick={() => setExpandedId(expanded ? null : id)}
                              title={expanded ? 'Close settings' : 'Open settings'}
                            >
                              <Icon icon={expanded ? 'fluent:chevron-up-20-filled' : 'fluent:chevron-down-20-filled'} width="16" height="16" />
                            </button>
                          )}
                          <button
                            type="button"
                            className="layer-icon-btn layer-remove-quick"
                            onClick={() => onRemove(id)}
                            title="Remove layer"
                          >
                            <Icon icon="fluent:dismiss-16-regular" width="16" height="16" />
                          </button>
                        </div>

                        {expanded && (
                          <>
                          <div className="layer-settings">
                            <div className="layer-setting-row">
                              <span className="layer-setting-label">Resolution</span>
                              <div className="layer-res-segment">
                                {QUALITY_ORDER.map(q => (
                                  <button
                                    key={q}
                                    type="button"
                                    className={`layer-res-btn${settings.quality === q ? ' active' : ''}`}
                                    onClick={() => onSettingsChange(id, { quality: q })}
                                  >
                                    {q}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {isImagery && (
                              <div className="layer-setting-row">
                                <span className="layer-setting-label">Opacity</span>
                                <input
                                  type="range"
                                  className="layer-opacity"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={settings.opacity}
                                  onChange={e => onSettingsChange(id, { opacity: Number(e.target.value) })}
                                />
                                <span className="layer-opacity-val">{Math.round(settings.opacity * 100)}%</span>
                              </div>
                            )}
                            <button
                              type="button"
                              className="layer-info-btn"
                              onClick={() => setInfoLayerId(id)}
                              title="About this layer"
                            >
                              <Icon icon="fluent:info-20-filled" width="14" height="14" />
                              <span className="layer-info-label">About this layer</span>
                            </button>
                          </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
                </>
              )
            })}
      </div>

      {/* Export single view button */}
      {onExportTab && (
        <div className="sidebar-export-bar">
          <button type="button" className="sidebar-export-btn" onClick={() => onExportTab(activeTabId)}>
            <Icon icon="fluent:image-arrow-download-20-regular" width="14" height="14" />
            Export View
          </button>
        </div>
      )}

      {/* Resize handle */}
      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeStart}
      />

      {/* Bottom panel: Grid Layout — collapsed unless active */}
      <div
        className={`sidebar-bottom-panel${gridViewActive ? ' expanded' : ''}`}
        ref={bottomPanelRef}
        style={gridViewActive ? { height: bottomHeight, flexShrink: 0 } : undefined}
      >
        <div className="sidebar-bottom-panel-header" onClick={onGridViewToggle}>
          <Icon icon="fluent:grid-20-filled" width="14" height="14" />
          <span>Grid Layout</span>
          <div className={`sidebar-grid-toggle${gridViewActive ? ' active' : ''}`}>
            <div className="sidebar-grid-toggle-knob" />
          </div>
        </div>

        {gridViewActive && (
          <div className="sidebar-grid-editor">
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
                        Use <code>%date%</code> and <code>%layer%</code> as placeholders
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
                Export Grid
              </button>
            )}
          </div>
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

      {infoLayerId && createPortal((() => {
        const infoLayer = layerById.get(infoLayerId)
        if (!infoLayer) return null
        return (
          <div className="info-overlay" onClick={() => setInfoLayerId(null)}>
            <div className="info-modal" onClick={e => e.stopPropagation()}>
              <div className="info-modal-header">
                <span className="info-modal-title">About This Layer</span>
                <button type="button" className="info-modal-close" onClick={() => setInfoLayerId(null)}>
                  <Icon icon="fluent:dismiss-20-filled" width="18" height="18" />
                </button>
              </div>
              <div className="info-modal-body">
                <div className="info-modal-layer-name">{infoLayer.name}</div>
                {infoLayer.subtitle && <div className="info-modal-layer-sub">{infoLayer.subtitle}</div>}
                {infoLayer.description && <p className="info-modal-desc">{infoLayer.description}</p>}
                {infoLayer.metadata && (
                  <div className="info-modal-cards">
                    {[
                      { label: 'Satellite', value: infoLayer.metadata.satellite, icon: 'fluent:globe-24-regular' },
                      { label: 'Sensor', value: infoLayer.metadata.sensors, icon: 'fluent:eye-24-regular' },
                      { label: 'Resolution', value: infoLayer.metadata.spatialResolution, icon: 'fluent:zoom-in-24-regular' },
                      { label: 'Coverage', value: infoLayer.metadata.spatialCoverage, icon: 'fluent:map-24-regular' },
                      { label: 'Frequency', value: infoLayer.metadata.temporalResolution, icon: 'fluent:clock-24-regular' },
                      { label: 'Energy', value: infoLayer.metadata.energySource, icon: 'fluent:lightbulb-24-regular' },
                      { label: 'Spectral', value: infoLayer.metadata.spectralRange, icon: 'fluent:paint-brush-24-regular' },
                      { label: 'Bands', value: infoLayer.metadata.spectralResolution, icon: 'fluent:options-24-regular' },
                      { label: 'Orbit', value: infoLayer.metadata.orbit, icon: 'fluent:circle-24-regular' },
                      { label: 'Mission', value: infoLayer.metadata.mission, icon: 'fluent:rocket-24-regular' },
                    ].filter(item => item.value && item.value !== 'N/A').map(item => (
                      <div key={item.label} className="info-modal-card">
                        <Icon icon={item.icon} width="20" height="20" className="info-modal-card-icon" />
                        <div className="info-modal-card-content">
                          <span className="info-modal-label">{item.label}</span>
                          <span className="info-modal-value">{item.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(infoLayer.startDate || infoLayer.endDate) && (
                  <div className="info-modal-card info-modal-card--availability">
                    <Icon icon="fluent:calendar-24-regular" width="20" height="20" className="info-modal-card-icon" />
                    <div className="info-modal-card-content">
                      <span className="info-modal-label">Data Availability</span>
                      <span className="info-modal-value">
                        {infoLayer.startDate && <span>{infoLayer.startDate}</span>}
                        {infoLayer.startDate && infoLayer.endDate && <span> — </span>}
                        {infoLayer.endDate && <span>{infoLayer.endDate}</span>}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })(), document.body)}

      {/* Floating ghost */}
      {ghost && (
        <div
          className="layer-row-ghost"
          style={{ left: ghost.x, top: ghost.y }}
          dangerouslySetInnerHTML={{ __html: ghost.html }}
        />
      )}
    </aside>
  )
}

export default TabbedSidebar
