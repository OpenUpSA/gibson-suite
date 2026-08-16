import React from 'react'
import './InfoSidebar.css'

const InfoSidebar = ({ layer, date }) => {
  const resolutionMatch = layer?.description?.match(/(\d+(?:\.\d+)?(?:m|km)\s+resolution)/i)
  const resolution = resolutionMatch ? resolutionMatch[1] : null

  return (
    <div className="info-sidebar">
      <div className="info-layer-name">{layer?.name}</div>
      {date && <div className="info-date">{date}</div>}
      <div className="info-description">{layer?.description}</div>
      {resolution && <div className="info-resolution">Resolution: {resolution}</div>}
      <div className="info-id">{layer?.id}</div>
      {!layer?.legendId && (
        <div className="info-no-legend">True color imagery — no scientific color map</div>
      )}
    </div>
  )
}

export default InfoSidebar
