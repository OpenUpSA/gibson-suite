import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import './ComparePanel.css'

/**
 * Sidebar panel for the Compare tool — two assignable cells (like the grid
 * view) for the before/after views, each with its own caption options
 * (same editor as the grid layout + GIF views).
 */
const ComparePanel = ({
  tabs,
  compareAId,
  compareBId,
  onCompareAChange,
  onCompareBChange,
  onSwap,
  onClose,
  captions,
  onCaptionChange,
  onCaptionToggleVisible,
  defaultCaption,
  captionPositions
}) => {
  const [cellFlyout, setCellFlyout] = useState(null) // 'before' | 'after' | null
  const [flyoutPos, setFlyoutPos] = useState(null) // { x, y } for portal flyout

  const sideTab = (side) => {
    const id = side === 'before' ? compareAId : compareBId
    return tabs.find(t => t.id === id)
  }

  // Open the assign-view flyout (click on a cell or the + / edit buttons,
  // or right-click anywhere on the cell).
  const openFlyout = (side, e) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setFlyoutPos({ x: rect.left + rect.width / 2, y: rect.bottom })
    setCellFlyout(prev => (prev === side ? null : side))
  }

  const assignView = (side, tabId) => {
    if (side === 'before') onCompareAChange(tabId)
    else onCompareBChange(tabId)
    setCellFlyout(null)
  }

  // Clicking outside the flyout closes it
  useEffect(() => {
    if (!cellFlyout) return
    const handleClick = (e) => {
      if (!e.target.closest('.compare-cell') && !e.target.closest('.cell-flyout')) setCellFlyout(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [cellFlyout])

  const renderCell = (side, title) => {
    const tab = sideTab(side)
    const layerCount = tab?.activeBySection?.imagery?.length || 0
    return (
      <div className="compare-cell-wrap">
        <div className="compare-cell-title">{title}</div>
        <div
          className={`compare-cell${tab ? ' has-view' : ''}${cellFlyout === side ? ' selected' : ''}`}
          onClick={(e) => { if (tab) openFlyout(side, e) }}
          onContextMenu={(e) => openFlyout(side, e)}
        >
          {tab ? (
            <>
              <span className="compare-cell-label">{tab.label}</span>
              <span className="compare-cell-meta">{tab.date}</span>
              <button
                type="button"
                className="compare-cell-edit"
                onClick={(e) => openFlyout(side, e)}
                title="Assign another view (right-click also works)"
              >
                <Icon icon="fluent:arrow-swap-16-regular" width="11" height="11" />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="compare-cell-add"
              onClick={(e) => openFlyout(side, e)}
              title="Assign a view"
            >
              <Icon icon="fluent:add-16-filled" width="14" height="14" />
            </button>
          )}
        </div>
        {tab && (
          <div className="compare-cell-layers">
            {layerCount
              ? `${layerCount} imagery layer${layerCount > 1 ? 's' : ''}`
              : 'No imagery layers'}
          </div>
        )}
      </div>
    )
  }

  const renderCaptionEditor = (side, title) => {
    const cap = captions?.[side] || defaultCaption || {}
    return (
      <div className="compare-caption-editor">
        <div className="compare-caption-editor-title">{title}</div>
        <div className="sidebar-grid-caption-controls">
          <div className="sidebar-grid-caption-header">
            <Icon icon="fluent:text-caption-20-filled" width="14" height="14" />
            <span>Caption</span>
            <div
              className={`sidebar-grid-caption-toggle${cap.visible ? ' active' : ''}`}
              onClick={() => onCaptionToggleVisible(side)}
            >
              <div className="sidebar-grid-caption-toggle-knob" />
            </div>
          </div>
          {cap.visible && (
            <div className="sidebar-grid-caption-fields">
              <div className="sidebar-grid-caption-textarea-wrap">
                <textarea
                  className="sidebar-grid-caption-textarea"
                  value={cap.text || ''}
                  onChange={(e) => onCaptionChange(side, 'text', e.target.value)}
                  rows={3}
                  placeholder="%date%  %layer%"
                />
                <div className="sidebar-grid-caption-hint">
                  Shown as-is — each line renders on its own row. <code>%date%</code> / <code>%layer%</code> still work if you want them.
                </div>
              </div>

              <div className="sidebar-grid-caption-field sidebar-grid-caption-row-field">
                <label>Position</label>
                <select
                  className="sidebar-grid-select"
                  value={cap.position || 'bottom-left'}
                  onChange={(e) => onCaptionChange(side, 'position', e.target.value)}
                >
                  {(captionPositions || []).map(pos => (
                    <option key={pos.value} value={pos.value}>{pos.label}</option>
                  ))}
                </select>
              </div>

              <div className="sidebar-grid-caption-field sidebar-grid-caption-row-field">
                <label>Font size</label>
                <div className="sidebar-grid-input-with-unit">
                  <input
                    type="number"
                    className="sidebar-grid-size-input"
                    min="8"
                    max="72"
                    step="1"
                    value={cap.fontSize ?? 11}
                    onChange={(e) => {
                      const v = Math.max(8, Math.min(72, parseInt(e.target.value) || 11))
                      onCaptionChange(side, 'fontSize', v)
                    }}
                  />
                  <span>px</span>
                </div>
              </div>

              <div className="sidebar-grid-caption-field sidebar-grid-caption-row-field">
                <label>Colors</label>
                <div className="sidebar-grid-caption-color-row">
                  <div className="sidebar-grid-caption-color-item">
                    <span>Overlay</span>
                    <input
                      type="color"
                      className="sidebar-grid-caption-color"
                      value={cap.overlayColor || '#000000'}
                      onChange={(e) => onCaptionChange(side, 'overlayColor', e.target.value)}
                    />
                  </div>
                  <div className="sidebar-grid-caption-color-item">
                    <span>Text</span>
                    <input
                      type="color"
                      className="sidebar-grid-caption-color"
                      value={cap.textColor || '#ffffff'}
                      onChange={(e) => onCaptionChange(side, 'textColor', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="sidebar-grid-caption-field sidebar-grid-caption-row-field">
                <label>Opacity</label>
                <div className="sidebar-grid-caption-opacity-row">
                  <input
                    type="number"
                    className="sidebar-grid-size-input sidebar-grid-caption-opacity-input"
                    min="0"
                    max="100"
                    step="5"
                    value={Math.round((cap.overlayOpacity ?? 0.55) * 100)}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                      onCaptionChange(side, 'overlayOpacity', v / 100)
                    }}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <aside className="compare-panel">
      <div className="compare-panel-header">
        <span className="compare-panel-title">Compare views</span>
        <button type="button" className="compare-panel-close" onClick={onClose} title="Close">
          <Icon icon="fluent:dismiss-20-filled" width="18" height="18" />
        </button>
      </div>
      <div className="compare-panel-scroll">
        <p className="compare-panel-hint">
          Two views overlaid on the map — drag the slider to reveal one side or the other. Click a box (or right-click) to assign a view.
        </p>

        <div className="compare-cells">
          {renderCell('before', 'Before')}
          {renderCell('after', 'After')}
        </div>

        <div className="compare-panel-swap-row">
          <button type="button" className="compare-panel-swap" onClick={onSwap}>
            <Icon icon="fluent:arrow-swap-20-regular" width="14" height="14" />
            Swap sides
          </button>
        </div>

        {renderCaptionEditor('before', 'Before caption')}
        {renderCaptionEditor('after', 'After caption')}
      </div>

      {/* Cell flyout portal — rendered outside overflow containers */}
      {cellFlyout !== null && flyoutPos && createPortal(
        <div
          className="cell-flyout"
          style={{
            position: 'fixed',
            left: flyoutPos.x,
            top: flyoutPos.y,
            transform: 'translate(-50%, 6px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {tabs.map(tab => {
            const isSelf = tab.id === sideTab(cellFlyout)?.id
            return (
              <button
                key={tab.id}
                type="button"
                className="cell-flyout-item"
                onClick={() => assignView(cellFlyout, tab.id)}
              >
                <span className="cell-flyout-name">{tab.label}</span>
                <span className="cell-flyout-sub">{tab.date}{isSelf ? ' · current' : ''}</span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </aside>
  )
}

export default ComparePanel
