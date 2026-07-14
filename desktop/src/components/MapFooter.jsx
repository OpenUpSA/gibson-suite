import React from 'react';
import './MapFooter.css';

const MapFooter = ({ layer }) => {
  if (!layer) return null;

  // Extract resolution/scale from description if available
  const resolutionMatch = layer.description?.match(/(\d+(?:\.\d+)?(?:m|km)\s+resolution)/i);
  const resolution = resolutionMatch ? resolutionMatch[1] : null;

  return (
    <div className="map-footer">
      <div className="map-footer-item">
        <span className="map-footer-label">Layer ID:</span>
        <span className="map-footer-value">{layer.id}</span>
      </div>
      <div className="map-footer-separator">•</div>
      <div className="map-footer-item">
        <span className="map-footer-label">Image Date:</span>
        <span className="map-footer-value">{layer.time}</span>
      </div>
      {resolution && (
        <>
          <div className="map-footer-separator">•</div>
          <div className="map-footer-item">
            <span className="map-footer-label">Scale:</span>
            <span className="map-footer-value">{resolution}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default MapFooter;
