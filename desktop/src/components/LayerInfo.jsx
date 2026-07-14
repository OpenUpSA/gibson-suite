import React from 'react';
import './LayerInfo.css';

const LayerInfo = ({ layer, onClose }) => {
  if (!layer) return null;

  // Extract resolution/scale from description if available
  const resolutionMatch = layer.description?.match(/(\d+(?:\.\d+)?(?:m|km)\s+resolution)/i);
  const resolution = resolutionMatch ? resolutionMatch[1] : null;

  return (
    <div className="layer-info-modal" onClick={onClose}>
      <div className="layer-info-content" onClick={(e) => e.stopPropagation()}>
        <h1>
          About This Layer
          <button className="layer-info-close" onClick={onClose}>×</button>
        </h1>
        
        <div className="layer-info-body">
          <div className="layer-info-header">
            <h2>{layer.name}</h2>
          </div>

          <div className="layer-info-description">
            <h3>Description</h3>
            <p>{layer.description}</p>
          </div>

          <div className="layer-info-footer">
            <div className="layer-info-footer-item">
              <span className="layer-info-footer-label">Layer ID:</span>
              <span className="layer-info-footer-value">{layer.id}</span>
            </div>
            <div className="layer-info-footer-item">
              <span className="layer-info-footer-label">Image Date:</span>
              <span className="layer-info-footer-value">{layer.time}</span>
            </div>
            {resolution && (
              <div className="layer-info-footer-item">
                <span className="layer-info-footer-label">Scale:</span>
                <span className="layer-info-footer-value">{resolution}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayerInfo;
