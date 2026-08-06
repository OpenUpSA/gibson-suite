import { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import './Sidebar.css'

const QUALITY_ORDER = ['low', 'medium', 'high']

const Sidebar = ({
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
  onClose
}) => {
  const [expandedId, setExpandedId] = useState(null)
  const [infoLayerId, setInfoLayerId] = useState(null)
  const [flyoutSection, setFlyoutSection] = useState(null)
  const contentRef = useRef(null)

  // ── Sortable-style drag-and-drop ──────────────────────────────────────
  // Items stay in their natural DOM flow — no transforms, no ghosts.
  // Swapping happens in the array; React repositions the DOM node instantly.
  const [dragIndex, setDragIndex] = useState(null) // index within section
  const [dragSection, setDragSection] = useState(null)
  const [ghost, setGhost] = useState(null)         // { x, y, html } — visual only
  const lastSwapFrom = useRef(null)  // prevents bounce-back double-swap
  const swapping = useRef(false)     // guard against re-entrant swaps

  // Clean up on sidebar close
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

  // Global mouse handlers — live only while dragging
  useEffect(() => {
    if (dragIndex === null) return

    const onMouseMove = (e) => {
      // Ghost follows cursor (purely visual, doesn't affect swap logic)
      setGhost(prev => prev ? { ...prev, x: e.clientX + 16, y: e.clientY + 16 } : null)

      if (swapping.current) return // wait for React to re-render

      const content = contentRef.current
      if (!content) return

      // Constrain cursor Y to sidebar content bounds
      const bounds = content.getBoundingClientRect()
      const cy = Math.max(bounds.top, Math.min(e.clientY, bounds.bottom - 1))

      // Which row is under the cursor?
      const under = document.elementFromPoint(e.clientX, cy)
      if (!under) return
      const targetRow = under.closest('.layer-row[data-section]')
      if (!targetRow || targetRow.dataset.section !== dragSection) return

      const rows = Array.from(
        content.querySelectorAll(`.layer-row[data-section="${dragSection}"]`)
      )
      const targetIdx = rows.indexOf(targetRow)
      if (targetIdx === -1 || targetIdx === dragIndex) return

      // Swap when cursor crosses the target's vertical midpoint.
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
        // Allow next swap after React re-renders
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
    // Clone the dragged row for the floating ghost
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

  // Close flyout on outside click
  useEffect(() => {
    if (!flyoutSection) return
    const handleClick = (e) => {
      if (!e.target.closest('.sidebar-add-wrap')) setFlyoutSection(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [flyoutSection])

  // Compute total active layers
  const totalActive = sections.reduce((n, s) => n + s.ids.length, 0)

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-title">Layers</span>
        <button type="button" className="sidebar-close" onClick={onClose} title="Close">
          <Icon icon="fluent:dismiss-20-filled" width="18" height="18" />
        </button>
      </div>
      <div className="sidebar-content" ref={contentRef}>
        {totalActive === 0 && (
          <div className="sidebar-empty">No layers on the map yet.</div>
        )}

        {sections.map((section, sectionIdx) => {
          const availableLayers = (layerCatalog || []).filter(
            l => (l.section || (l.role === 'base' ? 'base' : 'reference')) === section.key
              && !section.ids.includes(l.id)
          )
          if (!section.ids.length && !availableLayers.length) {
            // Still render Add Layer button after imagery even if empty
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

      {/* Layer info modal */}
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

      {/* Floating ghost — purely visual, follows cursor, doesn't affect swaps */}
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

export default Sidebar
