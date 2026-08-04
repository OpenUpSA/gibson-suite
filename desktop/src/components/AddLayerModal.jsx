import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import './AddLayerModal.css'

// Build the left-side accordion groups from the catalogue:
//  1. Reference layers (static overlays)
//  2. Base layers
//  3. Imagery layers, grouped by their category (e.g. "True Color")
const buildGroups = (catalog) => {
  const groups = []
  const reference = catalog.filter(l => l.section === 'reference')
  if (reference.length) groups.push({ key: 'reference', title: 'Reference layers', layers: reference })
  const base = catalog.filter(l => l.section === 'base')
  if (base.length) groups.push({ key: 'base', title: 'Base layers', layers: base })

  const categories = new Map()
  for (const layer of catalog.filter(l => l.section === 'imagery')) {
    const cat = layer.category || 'Imagery'
    if (!categories.has(cat)) categories.set(cat, [])
    categories.get(cat).push(layer)
  }
  for (const [cat, layers] of categories) {
    groups.push({ key: `cat:${cat}`, title: cat, layers })
  }
  return groups
}

const formatDate = (d) => {
  if (!d) return null
  const dt = new Date(`${d}T00:00:00Z`)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const AddLayerModal = ({ catalog, activeLayers, onAdd, open, onClose }) => {
  const groups = useMemo(() => buildGroups(catalog), [catalog])
  const activeSet = useMemo(() => new Set(activeLayers), [activeLayers])

  const [expanded, setExpanded] = useState(() => new Set(groups.map(g => g.key)))
  const [selectedId, setSelectedId] = useState(() => {
    // Default to the first imagery layer (True Color VIIRS)
    const imagery = catalog.filter(l => l.section === 'imagery')
    return imagery[0]?.id || catalog[0]?.id || null
  })

  if (!open) return null

  const toggleGroup = (key) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selected = catalog.find(l => l.id === selectedId) || null
  const selectedAdded = selected ? activeSet.has(selected.id) : false

  return (
    <div className="add-layer-overlay" onClick={onClose}>
      <div className="add-layer-modal" onClick={e => e.stopPropagation()}>
        <div className="add-layer-header">
          <span className="add-layer-title">Add Layer</span>
          <button type="button" className="add-layer-close" onClick={onClose} title="Close">
            <Icon icon="fluent:dismiss-20-filled" width="18" height="18" />
          </button>
        </div>

        <div className="add-layer-body">
          {/* Left: accordion navigation */}
          <div className="add-layer-nav">
            {groups.map(group => (
              <div key={group.key} className="add-layer-group">
                <button
                  type="button"
                  className="add-layer-group-header"
                  onClick={() => toggleGroup(group.key)}
                >
                  <Icon
                    icon={expanded.has(group.key) ? 'fluent:chevron-down-20-filled' : 'fluent:chevron-right-20-filled'}
                    width="14"
                    height="14"
                  />
                  <span className="add-layer-group-title">{group.title}</span>
                  <span className="add-layer-group-count">{group.layers.length}</span>
                </button>
                {expanded.has(group.key) && (
                  <div className="add-layer-group-list">
                    {group.layers.map(layer => (
                      <button
                        key={layer.id}
                        type="button"
                        className={`add-layer-item${selectedId === layer.id ? ' selected' : ''}${activeSet.has(layer.id) ? ' added' : ''}`}
                        onClick={() => setSelectedId(layer.id)}
                      >
                        <span className="add-layer-item-name">
                          <span className="add-layer-item-title">{layer.name}</span>
                          {layer.subtitle && <span className="add-layer-item-sub">{layer.subtitle}</span>}
                        </span>
                        {activeSet.has(layer.id) && (
                          <Icon icon="fluent:checkmark-circle-20-filled" width="16" height="16" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right: layer details */}
          <div className="add-layer-details">
            {selected ? (
              <>
                <div className="add-layer-details-head">
                  <div>
                    <div className="add-layer-details-title">{selected.name}</div>
                    {selected.subtitle && <div className="add-layer-details-subtitle">{selected.subtitle}</div>}
                  </div>
                  <button
                    type="button"
                    className={`add-layer-add-btn${selectedAdded ? ' added' : ''}`}
                    disabled={selectedAdded}
                    onClick={() => onAdd(selected)}
                  >
                    {selectedAdded ? (
                      <>
                        <Icon icon="fluent:checkmark-20-filled" width="16" height="16" />
                        Added
                      </>
                    ) : (
                      <>
                        <Icon icon="fluent:add-20-filled" width="16" height="16" />
                        Add to map
                      </>
                    )}
                  </button>
                </div>

                {selected.startDate && (
                  <div className="add-layer-dates">
                    <span className="add-layer-date-chip">
                      <Icon icon="fluent:calendar-20-filled" width="14" height="14" />
                      {formatDate(selected.startDate)} — {formatDate(selected.endDate || selected.latestDate)}
                    </span>
                    {selected.latestDate && (
                      <span className="add-layer-date-chip latest">
                        <Icon icon="fluent:clock-20-filled" width="14" height="14" />
                        Latest: {formatDate(selected.latestDate)}
                      </span>
                    )}
                  </div>
                )}

                {selected.description && (
                  <div className="add-layer-detail-block">
                    <div className="add-layer-detail-label">Overview</div>
                    <div className="add-layer-detail-html" dangerouslySetInnerHTML={{ __html: selected.description }} />
                  </div>
                )}

                {selected.gibsDescription && (
                  <div className="add-layer-detail-block">
                    <div className="add-layer-detail-label">About this layer — NASA GIBS</div>
                    <div className="add-layer-detail-html" dangerouslySetInnerHTML={{ __html: selected.gibsDescription }} />
                  </div>
                )}
              </>
            ) : (
              <div className="add-layer-details-empty">Select a layer to see its details.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AddLayerModal
