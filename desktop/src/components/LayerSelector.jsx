import React, { useState } from 'react'
import { Icon } from '@iconify/react'
import './LayerSelector.css'

const CATEGORY_ICONS = {
  'Aerosols & Air Quality':     'fluent:weather-fog-20-filled',
  'Corrected Reflectance':      'fluent:eye-20-filled',
  'Elevation & Terrain':        'ph:mountains-fill',
  'Fires & Thermal Anomalies':  'fluent:fire-20-filled',
  'Floods & Surface Water':     'fluent:drop-20-filled',
  'Natural Hazard Risk':        'fluent:warning-20-filled',
  'Night Lights':               'fluent:weather-moon-20-filled',
  'Ocean & Water Quality':      'fluent:globe-20-filled',
  'Orbit Tracks':               'fluent:radar-20-filled',
  'Population & Land Use':      'fluent:building-20-filled',
  'Precipitation':              'fluent:weather-rain-20-filled',
  'Snow & Ice':                 'fluent:weather-snowflake-20-filled',
  'Soil Moisture':              'fluent:beaker-20-filled',
  'Temperature':                'fluent:temperature-20-filled',
  'Vegetation & Land Cover':    'fluent:leaf-20-filled',
  'Water Vapor & Clouds':       'fluent:weather-cloudy-20-filled',
}

const LayerSelector = ({ config, onLayerSelect, selectedLayer }) => {
  const getActiveCategoryName = () => {
    if (!selectedLayer) return null
    for (const [categoryName, layers] of Object.entries(config.categories)) {
      if (layers.some(layer => layer.id === selectedLayer.id)) {
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
        {Object.entries(config.categories).map(([categoryName, layers]) => (
          <div key={categoryName} className="category">
            <button
              className="category-header"
              onClick={() => toggleCategory(categoryName)}
            >
              {CATEGORY_ICONS[categoryName] && (
                <Icon icon={CATEGORY_ICONS[categoryName]} width="16" height="16" color="#ffc93c" />
              )}
              <span className="category-name">{categoryName}</span>
              <span className="category-icon">
                {expandedCategories[categoryName] ? '▼' : '▶'}
              </span>
              <span className="layer-count">({layers.length})</span>
            </button>

            {expandedCategories[categoryName] && (
              <div className="layers-list">
                {layers.map((layer) => (
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
