import { useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import './Sidebar.css'

const QUALITY_ORDER = ['low', 'medium', 'high']

const Sidebar = ({
  sections,
  layerById,
  layerSection,
  layerSettings,
  onRemove,
  onReorder,
  onSettingsChange,
  onAddClick,
  open,
  onClose
}) => {
  const [expandedId, setExpandedId] = useState(null)
  // Refs for drag state — refs update synchronously, unlike state, so drop
  // handlers always read the current dragged index (HTML5 DnD quirk).
  const dragSectionRef = useRef(null)
  const dragIndexRef = useRef(null)
  const [dragOver, setDragOver] = useState(null) // { section, index }

  const totalActive = sections.reduce((n, s) => n + s.ids.length, 0)

  const sectionIdsFor = (section) => sections.find(s => s.key === section)?.ids || []

  const handleDrop = (section, targetIndex) => {
    const from = dragIndexRef.current
    const fromSection = dragSectionRef.current
    setDragOver(null)
    dragIndexRef.current = null
    dragSectionRef.current = null
    // Reordering is scoped to a single section (base/imagery/reference) so the
    // section stacking order is always preserved on the map.
    if (from === null || fromSection !== section || from === targetIndex) return
    const next = [...sectionIdsFor(section)]
    const [moved] = next.splice(from, 1)
    next.splice(targetIndex, 0, moved)
    onReorder(section, next)
  }

  return (
    <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-title">Layers</span>
        <button type="button" className="sidebar-close" onClick={onClose} title="Close">
          <Icon icon="fluent:dismiss-20-filled" width="18" height="18" />
        </button>
      </div>
      <div className="sidebar-content">
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
                // Reference overlays are static — no settings at all.
                const canConfigure = layerSection(layer) !== 'reference'
                const expanded = expandedId === id && canConfigure
                const isImagery = layerSection(layer) === 'imagery'
                const isDragging = dragIndexRef.current === index && dragSectionRef.current === section.key
                const isDropTarget = dragOver?.section === section.key && dragOver.index === index
                return (
                  <div
                    key={id}
                    className={`layer-row${expanded ? ' expanded' : ''}${isDragging ? ' dragging' : ''}${isDropTarget ? ' drop-target' : ''}`}
                    onDragOver={(e) => {
                      if (dragSectionRef.current !== section.key) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOver({ section: section.key, index })
                    }}
                    onDragLeave={() => setDragOver(prev => (prev?.index === index && prev?.section === section.key ? null : prev))}
                    onDrop={() => handleDrop(section.key, index)}
                  >
                    <div className="layer-row-top">
                      <span
                        className="layer-drag-handle"
                        draggable
                        onDragStart={(e) => {
                          // setData is required for the drag to start in some browsers
                          e.dataTransfer.setData('text/plain', String(index))
                          e.dataTransfer.effectAllowed = 'move'
                          dragSectionRef.current = section.key
                          dragIndexRef.current = index
                        }}
                        onDragEnd={() => {
                          dragSectionRef.current = null
                          dragIndexRef.current = null
                          setDragOver(null)
                        }}
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
                      {canConfigure && (
                        <button
                          type="button"
                          className={`layer-settings-btn${expanded ? ' active' : ''}`}
                          onClick={() => setExpandedId(expanded ? null : id)}
                          title="Layer settings"
                        >
                          <Icon icon="fluent:settings-20-filled" width="16" height="16" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="layer-remove-btn"
                        onClick={() => onRemove(id)}
                        title="Remove layer"
                      >
                        <Icon icon="fluent:delete-20-regular" width="16" height="16" />
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
    </aside>
  )
}

export default Sidebar
