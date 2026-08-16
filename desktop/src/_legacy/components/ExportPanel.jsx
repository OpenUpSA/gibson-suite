import React from 'react'
import './ExportPanel.css'

const ExportPanel = ({
  exportTexts,
  overlayColor,
  overlayOpacity,
  textColor,
  crop,
  onExportTextsChange,
  onOverlayColorChange,
  onOverlayOpacityChange,
  onTextColorChange,
  onCropChange,
  onExport,
  paneCount
}) => {
  const handleTextChange = (index, value) => {
    const newTexts = [...exportTexts]
    newTexts[index] = value
    onExportTextsChange(newTexts)
  }

  const updateCrop = (side, value) => {
    const v = Math.max(0, parseInt(value) || 0)
    onCropChange({ ...crop, [side]: v })
  }

  const resetCrop = () => onCropChange({ top: 0, bottom: 0 })

  return (
    <div className="export-panel">
      <div className="export-panel-header">Export</div>

      <div className="export-section">
        <div className="export-section-title-row">
          <span className="export-section-title">Crop (pixels)</span>
          <button className="export-reset-btn" onClick={resetCrop} title="Reset crop">✕</button>
        </div>
        <div className="export-crop-grid">
          <div className="export-crop-field">
            <label className="export-label">Top</label>
            <input
              className="export-number"
              type="number"
              min="0"
              step="10"
              value={crop.top}
              onChange={(e) => updateCrop('top', e.target.value)}
            />
          </div>
          <div className="export-crop-field">
            <label className="export-label">Bottom</label>
            <input
              className="export-number"
              type="number"
              min="0"
              step="10"
              value={crop.bottom}
              onChange={(e) => updateCrop('bottom', e.target.value)}
            />
          </div>
        </div>
      </div>

      {Array.from({ length: paneCount }, (_, i) => (
        <div key={i} className="export-field">
          <label className="export-label">{paneCount > 1 ? `Pane ${i + 1}` : 'Text'}</label>
          <textarea
            className="export-textarea"
            value={exportTexts[i] || ''}
            onChange={(e) => handleTextChange(i, e.target.value)}
            rows={4}
          />
        </div>
      ))}

      <div className="export-field-row">
        <div className="export-field export-field-half">
          <label className="export-label">Overlay</label>
          <div className="export-color-row">
            <input
              className="export-color"
              type="color"
              value={overlayColor}
              onChange={(e) => onOverlayColorChange(e.target.value)}
            />
            <input
              className="export-opacity"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={overlayOpacity}
              onChange={(e) => onOverlayOpacityChange(parseFloat(e.target.value))}
            />
          </div>
          <span className="export-opacity-label">{Math.round(overlayOpacity * 100)}%</span>
        </div>

        <div className="export-field export-field-half">
          <label className="export-label">Text color</label>
          <input
            className="export-color"
            type="color"
            value={textColor}
            onChange={(e) => onTextColorChange(e.target.value)}
          />
        </div>
      </div>

      <button className="export-button" onClick={onExport}>
        Export
      </button>
    </div>
  )
}

export default ExportPanel