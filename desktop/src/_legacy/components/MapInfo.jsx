import React from 'react'
import './MapInfo.css'

const MapInfo = ({ hoverInfo }) => {
  if (!hoverInfo) return null

  return (
    <div className="map-info-panel">
      <div className="info-item">
        <span className="info-label">Lat:</span>
        <span className="info-value">{hoverInfo.lat}°</span>
      </div>
      <div className="info-item">
        <span className="info-label">Lng:</span>
        <span className="info-value">{hoverInfo.lng}°</span>
      </div>
    </div>
  )
}

export default MapInfo
