import { useRef, useState, useCallback, useEffect } from 'react'
import { Icon } from '@iconify/react'
import './Sidebar.css'

const QUALITY_ORDER = ['low', 'medium', 'high']

const Sidebar = ({
  sections,
  layerById,
  layerSection,
  layerSettings,
  hiddenLayers,
  onRemove,
  onReorder,
  onSettingsChange,
  onToggleVisibility,
  onAddClick,
  open,
  onClose
}) => {
  const [expandedId, setExpandedId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
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

        {sections.map(section => {
          if (!section.ids.length) return null
          return (
            <div key={section.key} className="sidebar-section">
              <div className="sidebar-section-title">{section.title}</div>
              {section.ids.map((id, index) => {
                const layer = layerById.get(id)
                if (!layer) return null
                const settings = layerSettings[id] ?? { quality: 'low', opacity: 1 }
                const canConfigure = layerSection(layer) !== 'reference'
                const expanded = expandedId === id && canConfigure
                const isImagery = layerSection(layer) === 'imagery'
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
                      <button
                        type="button"
                        className={`layer-icon-btn${expanded ? ' active' : ''}`}
                        onClick={() => setExpandedId(expanded ? null : id)}
                        title={expanded ? 'Close details' : 'Open details'}
                      >
                        <Icon icon={expanded ? 'fluent:chevron-up-20-filled' : 'fluent:chevron-down-20-filled'} width="16" height="16" />
                      </button>
                    </div>

                    {expanded && (
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
                          className="layer-remove-btn"
                          onClick={() => setConfirmDeleteId(id)}
                          title="Remove layer"
                        >
                          <Icon icon="fluent:dismiss-16-regular" width="14" height="14" />
                          <span>Remove layer</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="sidebar-footer">
        <button type="button" className="add-layer-btn" onClick={onAddClick}>
          <Icon icon="fluent:add-20-filled" width="16" height="16" />
          Add Layer
        </button>
      </div>

      {/* Floating ghost — purely visual, follows cursor, doesn't affect swaps */}
      {ghost && (
        <div
          className="layer-row-ghost"
          style={{ left: ghost.x, top: ghost.y }}
          dangerouslySetInnerHTML={{ __html: ghost.html }}
        />
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="confirm-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <p>Are you sure you want to remove this layer?</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-cancel"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm-delete"
                onClick={() => { onRemove(confirmDeleteId); setConfirmDeleteId(null); }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

export default Sidebar
