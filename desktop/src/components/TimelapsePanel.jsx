import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import DateRangePicker from './DateRangePicker'
import './TimelapsePanel.css'

const INTERVALS = [
  { value: 1, short: '1D', label: 'Every day' },
  { value: 3, short: '3D', label: 'Every 3 days' },
  { value: 7, short: '7D', label: 'Every 7 days' },
  { value: 30, short: '30D', label: 'Every 30 days' },
]

const PRESETS = [
  { id: '16:9', ratio: 16 / 9, label: '16:9' },
  { id: '1:1', ratio: 1, label: '1:1' },
  { id: 'freeform', ratio: null, label: 'Freeform' },
]

const TimelapsePanel = ({
  tabs,
  viewTab,
  onViewTabChange,
  layerSummary,
  hasLayers,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  interval,
  onIntervalChange,
  aspect,
  onApplyPreset,
  onResetRect,
  availableCount,
  onClose,
  children,
}) => {
  const [viewFlyout, setViewFlyout] = useState(false)
  const [flyoutPos, setFlyoutPos] = useState(null)

  // Close the view flyout when clicking outside it.
  useEffect(() => {
    if (!viewFlyout) return
    const handleClick = (e) => {
      if (!e.target.closest('.timelapse-view-cell') && !e.target.closest('.cell-flyout')) setViewFlyout(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [viewFlyout])

  const openViewFlyout = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setFlyoutPos({ x: rect.left + rect.width / 2, y: rect.bottom })
    setViewFlyout(prev => !prev)
  }

  const assignView = (tabId) => {
    onViewTabChange(tabId)
    setViewFlyout(false)
  }

  return (
    <aside className="timelapse-panel">
      <div className="timelapse-panel-header">
        <span className="timelapse-panel-title">Timelapse GIF</span>
        <button type="button" className="timelapse-panel-close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div className="timelapse-panel-top">
        {/* Area — aspect presets + reset, all in one line like the grid view */}
        <div className="timelapse-section timelapse-section--area">
          <div className="timelapse-area-row">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`timelapse-area-btn${(p.ratio === null ? aspect === null : p.ratio === aspect) ? ' active' : ''}`}
                onClick={() => onApplyPreset(p.ratio)}
                title={p.label}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className="timelapse-area-btn timelapse-area-btn--reset"
              onClick={onResetRect}
              title="Reset box to view"
            >
              <Icon icon="fluent:arrow-reset-20-regular" width="14" height="14" />
            </button>
          </div>
        </div>

        {/* View — pick which view (tab) the timelapse exports */}
        <div className="timelapse-section timelapse-section--view">
          <div className="timelapse-view-cell">
            {viewTab ? (
              <>
                <span className="timelapse-view-label">{viewTab.label}</span>
                <span className="timelapse-view-meta">{viewTab.date}</span>
                <button
                  type="button"
                  className="timelapse-view-info"
                  onClick={(e) => e.stopPropagation()}
                  title={layerSummary || 'No imagery layer active'}
                >
                  <Icon icon="fluent:info-16-regular" width="11" height="11" />
                </button>
                <button
                  type="button"
                  className="timelapse-view-edit"
                  onClick={openViewFlyout}
                  title="Assign another view"
                >
                  <Icon icon="fluent:chevron-down-16-regular" width="11" height="11" />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="timelapse-view-add"
                onClick={openViewFlyout}
                title="Assign a view"
              >
                <Icon icon="fluent:add-16-filled" width="14" height="14" />
              </button>
            )}
          </div>
          {!hasLayers && (
            <div className="timelapse-hint">Add an imagery layer (e.g. True Color) via the Layers tool to export a timelapse.</div>
          )}
        </div>

        {/* Period — start – end date boxes + interval in one row */}
        <div className="timelapse-section">
          <div className="timelapse-date-row">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={onStartDateChange}
              onEndDateChange={onEndDateChange}
              startYear={2000}
            />
            <div className="timelapse-interval">
              <Icon icon="fluent:calendar-clock-20-regular" width="14" height="14" title="Interval" />
              <div className="timelapse-interval-select-wrap">
                <select
                  className="sidebar-grid-select"
                  value={interval}
                  onChange={(e) => onIntervalChange(parseInt(e.target.value, 10))}
                  title="Interval between frames"
                >
                  {INTERVALS.map((i) => (
                    <option key={i.value} value={i.value}>{i.label}</option>
                  ))}
                </select>
                <span className="timelapse-interval-short">
                  {(INTERVALS.find(i => i.value === interval) || INTERVALS[0]).short}
                </span>
              </div>
            </div>
          </div>
          {availableCount > 0 && (
            <div className="timelapse-count">{availableCount} images in range</div>
          )}
        </div>

      </div>

      {/* Available images — fetch + list, embedded below the date selector */}
      <div className="timelapse-panel-browser">
        {children}
      </div>

      {/* View flyout portal — rendered outside overflow containers */}
      {viewFlyout && flyoutPos && createPortal(
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
            const isSelf = tab.id === viewTab?.id
            return (
              <button
                key={tab.id}
                type="button"
                className="cell-flyout-item"
                onClick={() => assignView(tab.id)}
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

export default TimelapsePanel