import { useMemo, useState, useCallback, useEffect } from 'react'
import { Icon } from '@iconify/react'
import './AddLayerModal.css'

// Build the left-side accordion groups from the new categories structure
const buildGroups = (categories) => {
  const groups = []
  for (const [key, cat] of Object.entries(categories)) {
    // Skip base and reference layers - they're managed via Sidebar quick-add
    const layers = (cat.layers || []).filter(l => l.section !== 'base' && l.section !== 'reference')
    if (layers.length > 0) {
      groups.push({ key, title: key, icon: cat.icon, description: cat.description, layers })
    }
  }
  return groups
}

// Extract unique filter values from all layers
const buildFilterOptions = (catalog) => {
  const filters = {}
  const fields = ['mission', 'satellite', 'sensors', 'orbit', 'energySource', 'spectralRange', 'spectralResolution', 'spatialCoverage', 'spatialResolution', 'temporalResolution']
  
  for (const field of fields) {
    const values = new Set()
    for (const layer of catalog) {
      const val = layer.metadata?.[field]
      if (val && val !== 'N/A') values.add(val)
    }
    if (values.size > 0) {
      filters[field] = Array.from(values).sort()
    }
  }
  return filters
}

// Human-readable labels for metadata fields
const FIELD_LABELS = {
  mission: 'Mission',
  satellite: 'Satellite',
  sensors: 'Sensors',
  orbit: 'Orbit',
  energySource: 'Energy',
  spectralRange: 'Spectral Range',
  spectralResolution: 'Bands',
  spatialCoverage: 'Coverage',
  spatialResolution: 'Resolution',
  temporalResolution: 'Update Frequency'
}

// Fluent icons for each filter category
const FIELD_ICONS = {
  mission: 'fluent:rocket-20-filled',
  satellite: 'fluent:globe-20-filled',
  sensors: 'fluent:eye-20-filled',
  orbit: 'fluent:circle-20-filled',
  energySource: 'fluent:lightbulb-20-filled',
  spectralRange: 'fluent:paint-brush-20-filled',
  spectralResolution: 'fluent:options-20-filled',
  spatialCoverage: 'fluent:map-20-filled',
  spatialResolution: 'fluent:grid-20-filled',
  temporalResolution: 'fluent:clock-20-filled'
}

// Categories now include icon and description directly

const formatDate = (d) => {
  if (!d) return null
  const dt = new Date(`${d}T00:00:00Z`)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const AddLayerModal = ({ catalog, categories = {}, activeLayers, onAdd, onRemove, open, onClose }) => {
  const groups = useMemo(() => buildGroups(categories), [categories])
  const activeSet = useMemo(() => new Set(activeLayers), [activeLayers])
  const filterOptions = useMemo(() => buildFilterOptions(catalog), [catalog])

  // Accordion: expanded category groups (start all closed)
  const [expanded, setExpanded] = useState(new Set())
  const [selectedId, setSelectedId] = useState(null)
  // Which category's info is shown in the right panel (null = none)
  const [selectedCatKey, setSelectedCatKey] = useState(null)
  const [activeFilters, setActiveFilters] = useState({})
  const [expandedFilters, setExpandedFilters] = useState(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Expand/collapse a category's layer list (chevron click)
  const toggleGroup = useCallback((key) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Show category info in the right panel (heading click)
  const handleCatInfo = useCallback((key) => {
    setSelectedCatKey(prev => prev === key ? null : key)
    setSelectedId(null)
  }, [])

  const toggleFilterValue = useCallback((field, value) => {
    setActiveFilters(prev => {
      const current = prev[field] || []
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
      if (next.length === 0) {
        const { [field]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [field]: next }
    })
  }, [])

  const filteredGroups = useMemo(() => {
    const activeFilterEntries = Object.entries(activeFilters)
    if (activeFilterEntries.length === 0) return groups
    return groups.map(group => ({
      ...group,
      layers: group.layers.filter(layer =>
        activeFilterEntries.every(([field, values]) => values.includes(layer.metadata?.[field]))
      )
    })).filter(group => group.layers.length > 0)
  }, [groups, activeFilters])

  // Auto-expand all groups with matching layers when filters are active
  useEffect(() => {
    if (Object.keys(activeFilters).length > 0) {
      setExpanded(new Set(filteredGroups.map(g => g.key)))
    }
  }, [activeFilters, filteredGroups])

  const hasActiveFilters = Object.keys(activeFilters).length > 0
  const selected = catalog.find(l => l.id === selectedId) || null
  const selectedAdded = selected ? activeSet.has(selected.id) : false

  const selectedCat = selectedCatKey ? filteredGroups.find(g => g.key === selectedCatKey) : null

  if (!open) return null

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
          {/* Filter toggle icon */}
          <button
            type="button"
            className={`add-layer-filter-toggle${filtersOpen ? ' active' : ''}${hasActiveFilters ? ' has-filters' : ''}`}
            onClick={() => setFiltersOpen(prev => !prev)}
            title={filtersOpen ? 'Hide filters' : 'Show filters'}
          >
            <span className="add-layer-filter-label">FILTER</span>
            <Icon icon="fluent:filter-20-filled" width="20" height="20" />
            {hasActiveFilters && <span className="add-layer-filter-badge">{Object.keys(activeFilters).length}</span>}
          </button>

          {/* Column 1: Filters (collapsible) */}
          {filtersOpen && (
            <div className="add-layer-filters-panel">

            <div className="add-layer-filter-accordion">
              {Object.entries(filterOptions).map(([field, values]) => (
                <div key={field} className="add-layer-filter-section">
                  <button
                    type="button"
                    className={`add-layer-filter-header${expandedFilters.has(field) ? ' expanded' : ''}`}
                    onClick={() => setExpandedFilters(prev => {
                      const next = new Set(prev)
                      if (next.has(field)) next.delete(field)
                      else next.add(field)
                      return next
                    })}
                  >
                    <Icon
                      icon={expandedFilters.has(field) ? 'fluent:chevron-down-20-filled' : 'fluent:chevron-right-20-filled'}
                      width="12"
                      height="12"
                    />
                    <Icon
                      icon={FIELD_ICONS[field]}
                      width="14"
                      height="14"
                      className="add-layer-filter-icon"
                    />
                    <span>{FIELD_LABELS[field]}</span>
                    {activeFilters[field]?.length > 0 && (
                      <span className="add-layer-filter-count">{activeFilters[field].length}</span>
                    )}
                  </button>
                  {expandedFilters.has(field) && (
                    <div className="add-layer-filter-options">
                      {values.map(value => (
                        <label key={value} className="add-layer-filter-option">
                          <input
                            type="checkbox"
                            checked={activeFilters[field]?.includes(value) || false}
                            onChange={() => toggleFilterValue(field, value)}
                          />
                          <span className="add-layer-filter-check" />
                          <span className="add-layer-filter-text">{value}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Column 2: Accordion nav */}
          <div className="add-layer-nav">
            {filteredGroups.map(group => (
              <div key={group.key} className="add-layer-group">
                <div className="add-layer-group-heading">
                  <button
                    type="button"
                    className="add-layer-group-expand"
                    onClick={() => toggleGroup(group.key)}
                    title={expanded.has(group.key) ? 'Collapse' : 'Expand'}
                  >
                    <Icon
                      icon={expanded.has(group.key) ? 'fluent:chevron-down-20-filled' : 'fluent:chevron-right-20-filled'}
                      width="14"
                      height="14"
                    />
                  </button>
                  <button
                    type="button"
                    className="add-layer-group-info"
                    onClick={() => handleCatInfo(group.key)}
                  >
                    {group.icon && (
                      <Icon
                        icon={group.icon}
                        width="20"
                        height="20"
                        className="add-layer-group-icon"
                      />
                    )}
                    <span className="add-layer-group-title">{group.title}</span>
                  </button>
                  <span className="add-layer-group-count">{group.layers.length}</span>
                </div>
                {expanded.has(group.key) && (
                  <div className="add-layer-group-list">
                    {group.layers.map(layer => (
                      <button
                        key={layer.id}
                        type="button"
                        className={`add-layer-item${selectedId === layer.id ? ' selected' : ''}${activeSet.has(layer.id) ? ' added' : ''}`}
                        onClick={() => { setSelectedId(layer.id); setSelectedCatKey(null) }}
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
                    onClick={() => selectedAdded ? onRemove(selected.id) : onAdd(selected)}
                  >
                    {selectedAdded ? (
                      <>
                        <Icon icon="fluent:delete-20-regular" width="16" height="16" />
                        Remove
                      </>
                    ) : (
                      <>
                        <Icon icon="fluent:add-20-filled" width="16" height="16" />
                        Add to map
                      </>
                    )}
                  </button>
                </div>

                {selected.description && (
                  <div className="add-layer-detail-block">
                    <div className="add-layer-detail-html add-layer-detail-intro" dangerouslySetInnerHTML={{ __html: selected.description }} />
                  </div>
                )}

                {selected.metadata && (
                  <div className="add-layer-detail-block">
                    <div className="add-layer-metadata-cards">
                      {[
                        { key: 'satellite', label: 'Satellite', value: selected.metadata.satellite, icon: 'fluent:globe-20-regular' },
                        { key: 'sensors', label: 'Sensor', value: selected.metadata.sensors, icon: 'fluent:eye-20-regular' },
                        { key: 'spatialResolution', label: 'Resolution', value: selected.metadata.spatialResolution, icon: 'fluent:zoom-in-20-regular' },
                        { key: 'spatialCoverage', label: 'Coverage', value: selected.metadata.spatialCoverage, icon: 'fluent:map-20-regular' },
                        { key: 'temporalResolution', label: 'Frequency', value: selected.metadata.temporalResolution, icon: 'fluent:clock-20-regular' },
                        { key: 'energySource', label: 'Energy', value: selected.metadata.energySource, icon: 'fluent:lightbulb-20-regular' },
                        { key: 'spectralRange', label: 'Spectral', value: selected.metadata.spectralRange, icon: 'fluent:paint-brush-20-regular' },
                        { key: 'spectralResolution', label: 'Bands', value: selected.metadata.spectralResolution, icon: 'fluent:options-20-regular' },
                        { key: 'orbit', label: 'Orbit', value: selected.metadata.orbit, icon: 'fluent:circle-20-regular' },
                        { key: 'mission', label: 'Mission', value: selected.metadata.mission, icon: 'fluent:rocket-20-regular' },
                        selected.startDate && { key: 'startDate', label: 'Available From', value: formatDate(selected.startDate), icon: 'fluent:calendar-20-regular' },
                        selected.endDate && { key: 'endDate', label: 'Available To', value: formatDate(selected.endDate), icon: 'fluent:calendar-end-20-regular' },
                        selected.latestDate && { key: 'latestDate', label: 'Latest', value: formatDate(selected.latestDate), icon: 'fluent:clock-20-regular' },
                      ].filter(item => item && item.value && item.value !== 'N/A').map(item => (
                        <div key={item.key} className="add-layer-metadata-card">
                          <Icon icon={item.icon} width="16" height="16" className="add-layer-metadata-card-icon" />
                          <div className="add-layer-metadata-card-content">
                            <span className="add-layer-metadata-card-label">{item.label}</span>
                            <span className="add-layer-metadata-card-value">{item.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.gibsDescription && (
                  <div className="add-layer-detail-block">
                    <div className="add-layer-detail-html" dangerouslySetInnerHTML={{ __html: selected.gibsDescription }} />
                  </div>
                )}
              </>
            ) : selectedCat ? (
              <div className="add-layer-cat-info">
                <div className="add-layer-cat-info-head">
                  <div className="add-layer-cat-info-icon">
                    <Icon
                      icon={selectedCat.icon || 'fluent:image-20-filled'}
                      width="32"
                      height="32"
                    />
                  </div>
                  <div>
                    <div className="add-layer-cat-info-title">{selectedCat.title}</div>
                    <div className="add-layer-cat-info-count">
                      {selectedCat.layers.length} layer{selectedCat.layers.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                {selectedCat.description && (
                  <div className="add-layer-cat-info-desc">
                    {selectedCat.description}
                  </div>
                )}
              </div>
            ) : (
              <div className="add-layer-details-empty">Select a layer or category to see details.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AddLayerModal
