import React from 'react'
import './DebugPanel.css'

const DebugPanel = ({ debugInfo, selectedLayer, isSplitView, date2, layer2Name }) => {
  if (!debugInfo) return null

  // Extract resolution/scale from description if available
  const resolutionMatch = selectedLayer?.description?.match(/(\d+(?:\.\d+)?(?:m|km)\s+resolution)/i);
  const resolution = resolutionMatch ? resolutionMatch[1] : null;

  return (
    <div className="debug-panel">
      <div className="debug-content">
        <span className="debug-item">
          <span className="debug-label">Layer ID:</span>
          <span className="debug-value">{debugInfo.layerId}</span>
        </span>
        
        <span className="debug-separator">•</span>
        
        {isSplitView ? (
          <>
            <span className="debug-item">
              <span className="debug-label">V1:</span>
              <span className="debug-value">{debugInfo.layerName}</span>
              <span className="debug-value" style={{color: '#ff9a3c'}}>{debugInfo.time}</span>
            </span>
            <span className="debug-separator">•</span>
            <span className="debug-item">
              <span className="debug-label">V2:</span>
              <span className="debug-value">{layer2Name}</span>
              <span className="debug-value" style={{color: '#3c9aff'}}>{date2}</span>
            </span>
          </>
        ) : (
          <span className="debug-item">
            <span className="debug-label">Image Date:</span>
            <span className="debug-value">{debugInfo.time}</span>
          </span>
        )}
        
        {resolution && (
          <>
            <span className="debug-separator">•</span>
            <span className="debug-item">
              <span className="debug-label">Scale:</span>
              <span className="debug-value">{resolution}</span>
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export default DebugPanel
