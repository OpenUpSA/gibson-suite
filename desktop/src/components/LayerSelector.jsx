import React, { useState } from 'react'
import { Icon } from '@iconify/react'
import './LayerSelector.css'

const LayerSelector = ({ config, onLayerSelect, selectedLayer }) => {
  const getActiveCategoryName = () => {
    if (!selectedLayer) return null
    for (const [categoryName, cat] of Object.entries(config.categories)) {
      if ((cat.layers || []).some(layer => layer.id === selectedLayer.id)) {
        return categoryName
      }
    }
    return null
  }

  const [expandedCategories, setExpandedCategories] = useState(
    Object.keys(config.categories).reduce((acc, category) => {
      acc[category] = category === getActiveCategoryName()
      return acc
    }, {})
  )

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }))
  }

  return (
    <div className="layer-selector">
      <div className="categories">
        {Object.entries(config.categories).map(([categoryName, cat]) => (
          <div key={categoryName} className="category">
            <button
              className="category-header"
              onClick={() => toggleCategory(categoryName)}
            >
              {cat.icon && (
                <Icon icon={cat.icon} width="16" height="16" color="#4FC3D9" />
              )}
              <span className="category-name">{categoryName}</span>
              <span className="category-icon">
                {expandedCategories[categoryName] ? '▼' : '▶'}
              </span>
              <span className="layer-count">({(cat.layers || []).length})</span>
            </button>

            {expandedCategories[categoryName] && (
              <div className="layers-list">
                {(cat.layers || []).map((layer) => (
                  <button
                    key={layer.id}
                    className={`layer-item ${selectedLayer?.id === layer.id ? 'active' : ''}`}
                    onClick={() => {
                      onLayerSelect(layer)
                      setExpandedCategories(prev => ({ ...prev, [categoryName]: true }))
                    }}
                  >
                    <div className="layer-name">{layer.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default LayerSelector
