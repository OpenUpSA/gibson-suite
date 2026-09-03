import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { encodeCompareShare, shareUrlFor } from '../utils/shareCompare'
import DatePicker from './DatePicker'
import GridCaptionColorPicker from './GridCaptionColorPicker'
import './ComparePanel.css'

/**
 * Sidebar panel for the Compare tool — two assignable cells (like the grid
 * view) for the two views, each with its own caption options
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
  dateOverrides,
  onDateChange,
  layerById
}) => {
  const [cellFlyout, setCellFlyout] = useState(null) // 'before' | 'after' | null
  const [flyoutPos, setFlyoutPos] = useState(null) // { x, y } for portal flyout
  const [copied, setCopied] = useState(false)
  const [selectedSide, setSelectedSide] = useState(null) // 'before' | 'after' | null — cell whose caption editor is shown

  const sideTab = (side) => {
    const id = side === 'before' ? compareAId : compareBId
    return tabs.find(t => t.id === id)
  }

  // All active layer names for a side, for the info tooltip.
  const layerNames = (tab) => {
    if (!tab) return ''
    const ids = [
      ...(tab.activeBySection?.imagery || []),
      ...(tab.activeBySection?.base || []),
      ...(tab.activeBySection?.reference || [])
    ]
    return ids.map(id => layerById.get(id)?.name).filter(Boolean).join(', ') || tab.label || ''
  }

  // Build a minimalist share link for the current before/after views and
  // copy it to the clipboard. Falls back to the first two tabs the same way
  // the compare workbench does when no explicit pair is picked yet.
  const handleShare = async () => {
    const tabA = sideTab('before') || tabs[0]
    const tabB = sideTab('after') || tabs[1] || tabs[0]
    if (!tabA || !tabB) return
    const payload = encodeCompareShare({ tabA, tabB, captions })
    const url = shareUrlFor(payload)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy share link:', e)
    }
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

  // Clicking a cell toggles its caption editor (same pattern as the layout
  // sidebar — captions are hidden until a view is selected).
  const toggleSelect = (side) => {
    setSelectedSide(prev => (prev === side ? null : side))
    setCellFlyout(null)
  }

  const assignView = (side, tabId) => {
    if (side === 'before') onCompareAChange(tabId)
    else onCompareBChange(tabId)
    setCellFlyout(null)
  }

  const cycleCaptionPosition = (side) => {
    const positions = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
    const cap = captions?.[side] || defaultCaption || {}
    const current = cap.position || 'bottom-left'
    const next = positions[(positions.indexOf(current) + 1) % positions.length]
    onCaptionChange(side, 'position', next)
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

  const renderCell = (side) => {
    const tab = sideTab(side)
    return (
      <div className="compare-cell-wrap">
        <div
          className={`compare-cell${tab ? ' has-view' : ''}${selectedSide === side ? ' selected' : ''}${cellFlyout === side ? ' flyout-open' : ''}`}
          onClick={(e) => { if (tab) toggleSelect(side) }}
          onContextMenu={(e) => openFlyout(side, e)}
        >
          {tab ? (
            <>
              <span className="compare-cell-label">{tab.label}</span>
              <span className="compare-cell-meta">{dateOverrides?.[side] || tab.date}</span>
              <button
                type="button"
                className="compare-cell-info"
                onClick={(e) => e.stopPropagation()}
                title={layerNames(tab)}
              >
                <Icon icon="fluent:info-16-regular" width="11" height="11" />
              </button>
              <button
                type="button"
                className="compare-cell-edit"
                onClick={(e) => openFlyout(side, e)}
                title="Assign another view (right-click also works)"
              >
                <Icon icon="fluent:chevron-down-16-regular" width="11" height="11" />
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
      </div>
    )
  }

  const renderCaptionEditor = (side) => {
    const cap = captions?.[side] || defaultCaption || {}
    return (
      <div className="sidebar-grid-caption-controls">
        <div className="sidebar-grid-caption-toggle-control">
          <Icon icon="fluent:text-caption-20-filled" width="14" height="14" title="Caption" />
          <span>Caption</span>
          <div
            className={`sidebar-grid-caption-toggle${cap.visible ? ' active' : ''}`}
            onClick={() => onCaptionToggleVisible(side)}
            role="switch"
            aria-checked={Boolean(cap.visible)}
            aria-label="Show caption"
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
              <Icon
                icon="fluent:question-circle-20-filled"
                width="14"
                height="14"
                className="grid-caption-help-icon"
                title="Shown as-is: each line renders on its own row. %date% and %layer% remain available."
              />
            </div>

            <div className="grid-caption-compact-row grid-caption-control-row">
              <button
                type="button"
                className="grid-caption-position-cycle"
                onClick={() => cycleCaptionPosition(side)}
                title="Move caption to the next corner"
                aria-label="Move caption to the next corner"
              >
                {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(position => (
                  <span
                    key={position}
                    className={cap.position === position ? 'active' : ''}
                  />
                ))}
              </button>
              <div className="grid-caption-compact-control">
                <Icon icon="fluent:text-font-size-20-filled" width="14" height="14" title="Caption font size" />
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
                  aria-label="Caption font size"
                />
              </div>
              <div className="grid-caption-color-control">
                <GridCaptionColorPicker
                  color={cap.overlayColor || '#000000'}
                  opacity={cap.overlayOpacity ?? 0.55}
                  icon="fluent:paint-brush-20-filled"
                  title="Choose caption overlay color and alpha"
                  withAlpha
                  onChange={(overlayColor) => onCaptionChange(side, { overlayColor, overlayOpacity: 1 })}
                />
              </div>
              <div className="grid-caption-color-control">
                <GridCaptionColorPicker
                  color={cap.textColor || '#ffffff'}
                  icon="fluent:text-color-20-filled"
                  title="Choose caption text color"
                  onChange={(textColor) => onCaptionChange(side, 'textColor', textColor)}
                />
              </div>
              <button
                type="button"
                className="grid-caption-color-reset"
                onClick={() => onCaptionChange(side, {
                  overlayColor: '#000000',
                  overlayOpacity: 0.55,
                  textColor: '#ffffff',
                })}
                title="Reset colors to black and white"
                aria-label="Reset colors to black and white"
              >
                <Icon icon="fluent:arrow-reset-20-regular" width="16" height="16" />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="sidebar compare-panel sidebar-open">
      <div className="sidebar-header">
        <span className="sidebar-title">Compare views</span>
        <button type="button" className="sidebar-close" onClick={onClose} title="Close">
          <Icon icon="fluent:dismiss-20-filled" width="18" height="18" />
        </button>
      </div>
      <div className="compare-panel-scroll">
        <div className="compare-cells-wrap">
          <div className="compare-cells">
            {renderCell('before')}
            {renderCell('after')}
          </div>
          <button
            type="button"
            className="compare-cell-swap"
            onClick={onSwap}
            title="Swap the two views"
            aria-label="Swap the two views"
          >
            <Icon icon="fluent:arrow-swap-20-regular" width="14" height="14" />
          </button>
        </div>

        {selectedSide && (
          <div className="compare-side-editor">
            <DatePicker
              selectedDate={dateOverrides?.[selectedSide] || sideTab(selectedSide)?.date}
              onDateChange={(d) => onDateChange(selectedSide, d)}
            />
            {renderCaptionEditor(selectedSide)}
          </div>
        )}

        <div className="compare-panel-share-row">
          <button
            type="button"
            className={`compare-panel-share${copied ? ' copied' : ''}`}
            onClick={handleShare}
            title="Copy a minimalist share link for this compare view"
          >
            <Icon
              icon={copied ? 'fluent:checkmark-20-filled' : 'fluent:share-20-regular'}
              width="14"
              height="14"
            />
            {copied ? 'Link copied!' : 'Share compare'}
          </button>
        </div>
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
