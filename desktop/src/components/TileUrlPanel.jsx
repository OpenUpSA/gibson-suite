import React, { useState } from 'react'
import './TileUrlPanel.css'
import { buildTileUrlTemplate } from '../config/tileUrl'

const TileUrlPanel = ({ layer, config, selectedTile, pickActive, onTogglePick }) => {
  const [copiedTemplate, setCopiedTemplate] = useState(false)
  const [copiedTile, setCopiedTile] = useState(false)

  if (!layer) return (
    <div className="tileurl-panel">
      <div className="tileurl-empty">No layer selected</div>
    </div>
  )

  const ext = layer.format?.split('/')[1] === 'jpeg' ? 'jpg' : layer.format?.split('/')[1] || 'png'
  const urlTemplate = buildTileUrlTemplate(config, layer, layer.time)
  // Tile picking only applies to WMTS layers; WMS layers use a bbox, not z/x/y
  const tileUrl = selectedTile && !layer.wms
    ? `${config.wmtsBaseUrl}/${layer.id}/default/${layer.time}/${layer.tileMatrixSet}/${selectedTile.z}/${selectedTile.y}/${selectedTile.x}.${ext}`
    : null

  const copy = (text, setCopied) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="tileurl-panel">
      <div className="tileurl-section-label">URL Template</div>
      <div className="tileurl-url-block">
        <div className="tileurl-url-text">{urlTemplate}</div>
        <button
          className="tileurl-copy-btn"
          onClick={() => copy(urlTemplate, setCopiedTemplate)}
          title="Copy template URL"
        >
          {copiedTemplate ? '✓' : 'Copy'}
        </button>
      </div>

      <div className="tileurl-divider" />

      <div className="tileurl-section-label">Pick a Tile</div>
      <p className="tileurl-hint">
        Click anywhere on the map to get the direct URL for that tile.
      </p>

      <button
        className={`tileurl-pick-btn ${pickActive ? 'active' : ''}`}
        onClick={onTogglePick}
      >
        {pickActive ? 'Cancel — click to stop' : 'Start picking'}
      </button>

      {selectedTile && tileUrl && (
        <div className="tileurl-tile-result">
          <div className="tileurl-tile-coords">
            z={selectedTile.z} &nbsp; x={selectedTile.x} &nbsp; y={selectedTile.y}
          </div>
          <div className="tileurl-url-block">
            <div className="tileurl-url-text">{tileUrl}</div>
            <div className="tileurl-tile-actions">
              <button
                className="tileurl-copy-btn"
                onClick={() => copy(tileUrl, setCopiedTile)}
                title="Copy tile URL"
              >
                {copiedTile ? '✓' : 'Copy'}
              </button>
              <a
                className="tileurl-open-btn"
                href={tileUrl}
                target="_blank"
                rel="noreferrer"
                title="Open tile in new tab"
              >
                Open
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TileUrlPanel
