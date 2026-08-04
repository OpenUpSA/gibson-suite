import React from 'react'
import DatePicker from './DatePicker'
import './SplitOptionsPanel.css'

const allLayers = (config) => {
  const result = []
  for (const [category, layers] of Object.entries(config.categories)) {
    for (const layer of layers) {
      result.push({ ...layer, category })
    }
  }
  return result
}

const SplitOptionsPanel = ({ config, panes, onPanesChange, exportTexts, onExportTextsChange, syncEnabled, onToggleSync }) => {
  const layers = allLayers(config)

  const handleLayerChange = (index, layerId) => {
    const layer = layers.find(l => l.id === layerId)
    if (!layer) return
    const newPanes = [...panes]
    newPanes[index] = { ...newPanes[index], layer }
    onPanesChange(newPanes)
  }

  const handleDateChange = (index, date) => {
    const newPanes = [...panes]
    newPanes[index] = { ...newPanes[index], date }
    onPanesChange(newPanes)
  }

  const addPane = () => {
    const last = panes[panes.length - 1]
    const newPane = { layer: last.layer, date: last.date }
    onPanesChange([...panes, newPane])
    onExportTextsChange([...exportTexts, '%date%\n%layer%'])
  }

  const removePane = (index) => {
    if (panes.length <= 2) return
    const newPanes = panes.filter((_, i) => i !== index)
    onPanesChange(newPanes)
    onExportTextsChange(exportTexts.filter((_, i) => i !== index))
  }

  return (
    <div className="split-options-panel">
      <div className="split-options-header">Split</div>

      <button
        className={`split-sync-toggle ${syncEnabled ? 'active' : ''}`}
        onClick={onToggleSync}
        title={syncEnabled ? 'Maps are synced — click to unlock' : 'Maps move independently — click to sync'}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M4 4a1 1 0 0 1 1-1h2a1 1 0 0 1 0 2H6.414l1.293 1.293a1 1 0 0 1-1.414 1.414L5 6.414V8a1 1 0 0 1-2 0V5a1 1 0 0 1 .293-.707L4.586 3.293A1 1 0 0 1 5 3zm0 12a1 1 0 0 0 1 1h2a1 1 0 0 0 0-2H6.414l1.293-1.293a1 1 0 0 0-1.414-1.414L5 13.586V12a1 1 0 0 0-2 0v3a1 1 0 0 0 .293.707l1.293 1.293A1 1 0 0 0 5 17zm10-12a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0V6.414l-1.293 1.293a1 1 0 0 1-1.414-1.414L15.586 5H14a1 1 0 0 1 0-2h1a1 1 0 0 1 1 1zm2 9a1 1 0 0 0-1-1h-2a1 1 0 0 0 0 2h1.586l-1.293 1.293a1 1 0 0 0 1.414 1.414L17 13.586V15a1 1 0 0 0 2 0v-3a1 1 0 0 0-.293-.707L17.414 10A1 1 0 0 1 17 14z"/>
        </svg>
        <span>{syncEnabled ? 'Sync on' : 'Sync off'}</span>
      </button>

      {panes.map((pane, i) => (
        <div key={i} className="split-pane-row">
          <div className="split-pane-row-header">
            <span className="split-pane-label">Pane {i + 1}</span>
            {panes.length > 2 && (
              <button className="split-pane-remove" onClick={() => removePane(i)} title="Remove pane">
                ✕
              </button>
            )}
          </div>
          <select
            className="split-layer-select"
            value={pane.layer.id}
            onChange={(e) => handleLayerChange(i, e.target.value)}
          >
            {Object.entries(config.categories).map(([category, layerList]) => (
              <optgroup key={category} label={category}>
                {layerList.map(layer => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="compare-date-row">
            <label className="compare-date-label">Date</label>
            <DatePicker
              selectedDate={pane.date}
              onDateChange={(d) => handleDateChange(i, d)}
            />
          </div>
        </div>
      ))}

      <button className="split-add-btn" onClick={addPane}>
        + Add pane
      </button>

    </div>
  )
}

export default SplitOptionsPanel
