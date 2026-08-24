import { useMemo } from 'react'
import { Icon } from '@iconify/react'
import './TimelapseBrowser.css'
import { buildWmsUrlMulti } from '../config/tileUrl'

const PREVIEW_W = 128
const PREVIEW_PAGE = 60

// Right-hand panel for the timelapse workbench.
//
// Phase 1 (list): shows every available date as a lightweight text list with
// checkboxes — NO images are downloaded. This is the "show what's available
// first" step and is cheap even for dozens of dates.
//
// Phase 2 (preview): only after the user ticks dates and clicks "Load
// previews" do we download anything. Each date is first probed with a 16×16
// PNG (see utils/timelapseProbe.js); dates with no imagery in the crop area
// are skipped. Previews are low-res (128px) JPEGs.
const TimelapseBrowser = ({
  layerName,
  layers,
  hasRect,
  bbox3857,
  wmsBaseUrl,
  dates,
  limit,
  selected,
  status,
  busy,
  confirmed,
  fetching,
  onToggleSelect,
  onSelectVisible,
  onClearSelection,
  onAddSelected,
  onLoadMore,
  onConfirm,
  onBackToList,
  coverage,
}) => {
  const visibleDates = dates.slice(0, limit)
  const selectedDates = useMemo(() => [...selected].sort(), [selected])
  const selectedCount = selectedDates.length

  const aspect = useMemo(() => {
    if (!bbox3857) return 1
    const [minX, minY, maxX, maxY] = bbox3857
    return (maxX - minX) / Math.max(1e-6, maxY - minY)
  }, [bbox3857])

  const previewH = Math.max(1, Math.round(PREVIEW_W / Math.max(0.1, aspect)))

  // Composite preview: stack every active layer (imagery/base first, then
  // reference overlays on top) for the given date, instead of a single layer.
  // TIME is resolved per layer: imagery/base use the date, reference uses
  // GIBS 'default'.
  const previewUrl = (date) =>
    layers?.length && bbox3857
      ? buildWmsUrlMulti(
          { wmsBaseUrl },
          layers.map(l => l.layer),
          bbox3857,
          PREVIEW_W,
          previewH,
          layers.map(l => (l.role === 'reference' ? 'default' : date)),
        )
      : ''

  // Per-layer coverage for a date: which layers actually have imagery here.
  // `coverage` is a Map<date, Map<layerId, boolean>> (true = has data).
  const coverageFor = (date) => coverage?.get(date)

  const allVisibleSelected = visibleDates.length > 0 && visibleDates.every((d) => selected.has(d))

  // ── Preview-mode progress counts ──────────────────────────────────────
  let ready = 0
  let empty = 0
  let loading = 0
  for (const d of selectedDates) {
    const s = status?.get(d)
    if (s === 'ok') ready++
    else if (s === 'empty') empty++
    else if (s === 'loading') loading++
  }

  const renderListMode = () => (
    <>
      <div className="tl-browser-toolbar">
        <button type="button" className="tl-browser-btn" onClick={onSelectVisible}>
          {allVisibleSelected ? 'Deselect shown' : 'Select shown'}
        </button>
        <button type="button" className="tl-browser-btn" onClick={onClearSelection} disabled={selectedCount === 0}>
          Clear
        </button>
      </div>
      <div className="tl-browser-count">
        {dates.length} available · showing {visibleDates.length}
      </div>
      <div className="tl-browser-progress">Tick dates below — previews only download after you confirm.</div>
      <div className="tl-list">
        {visibleDates.map((date) => {
          const s = status?.get(date)
          const cov = coverageFor(date)
          return (
            <button
              key={date}
              type="button"
              className={`tl-row${selected.has(date) ? ' selected' : ''}`}
              onClick={() => onToggleSelect(date)}
              title={date}
            >
              <span className="tl-row-check">
                {selected.has(date) ? (
                  <Icon icon="fluent:checkmark-20-filled" width="14" height="14" />
                ) : null}
              </span>
              <span className="tl-row-date">{date}</span>
              {cov
                ? [...cov.entries()].map(([layerId, has]) => (
                    <span
                      key={layerId}
                      className={`tl-row-badge${has ? ' tl-badge-ok' : ' tl-badge-empty'}`}
                      title={layerId}
                    >
                      {has ? layerId : `${layerId}: none`}
                    </span>
                  ))
                : s === 'empty' && <span className="tl-row-badge tl-badge-empty">no data</span>}
            </button>
          )
        })}
      </div>
      <div className="tl-browser-actions">
        <button
          type="button"
          className="tl-browser-btn tl-browser-btn--primary"
          onClick={onConfirm}
          disabled={selectedCount === 0}
        >
          Load previews ({selectedCount})
        </button>
        <button
          type="button"
          className="tl-browser-btn"
          onClick={onAddSelected}
          disabled={selectedCount === 0}
        >
          Add selected ({selectedCount})
        </button>
      </div>
      {dates.length > visibleDates.length && (
        <button type="button" className="tl-browser-btn tl-browser-loadmore" onClick={onLoadMore}>
          Load more ({dates.length - visibleDates.length} remaining)
        </button>
      )}
    </>
  )

  const renderPreviewMode = () => (
    <>
      <div className="tl-browser-toolbar">
        <button type="button" className="tl-browser-btn" onClick={onBackToList}>
          ← List
        </button>
        <button
          type="button"
          className="tl-browser-btn tl-browser-btn--primary"
          onClick={onConfirm}
          disabled={busy || selectedCount === 0}
        >
          {busy ? 'Loading…' : `Reload (${selectedCount})`}
        </button>
      </div>
      <div className="tl-browser-count">
        {dates.length} available · {selectedCount} selected
      </div>
      {busy ? (
        <div className="tl-browser-progress">
          Probing previews… ({ready + empty + loading}/{selectedCount})
        </div>
      ) : (
        <div className="tl-browser-progress">
          {ready > 0 && `${ready} previews ready`}
          {ready > 0 && empty > 0 && ' · '}
          {empty > 0 && `${empty} no data`}
        </div>
      )}
      <div className="tl-browser-grid">
        {selectedDates.map((date) => {
          const s = status?.get(date)
          if (s === 'ok') {
            return (
              <button
                key={date}
                type="button"
                className={`tl-thumb${selected.has(date) ? ' selected' : ''}`}
                onClick={() => onToggleSelect(date)}
                title={date}
              >
                <img src={previewUrl(date)} alt={date} loading="lazy" />
                <span className="tl-thumb-date">{date}</span>
                {selected.has(date) && (
                  <span className="tl-thumb-check">
                    <Icon icon="fluent:checkmark-20-filled" width="14" height="14" />
                  </span>
                )}
                {coverageFor(date) &&
                  [...coverageFor(date).entries()].map(([layerId, has]) => (
                    <span
                      key={layerId}
                      className={`tl-thumb-badge${has ? ' tl-badge-ok' : ' tl-badge-empty'}`}
                      title={layerId}
                    >
                      {has ? layerId : `${layerId}: none`}
                    </span>
                  ))}
              </button>
            )
          }
          if (s === 'empty' || s === 'error' || !s) {
            return (
              <button
                key={date}
                type="button"
                className={`tl-thumb tl-thumb-placeholder${s === 'empty' ? ' tl-thumb--nodata' : ''}${s === 'error' ? ' tl-thumb--error' : ''}`}
                onClick={() => onToggleSelect(date)}
                title={date}
              >
                <span className="tl-thumb-msg">
                  {s === 'empty' ? 'No data' : s === 'error' ? 'Failed' : 'Pending'}
                </span>
                <span className="tl-thumb-date">{date}</span>
              </button>
            )
          }
          // loading
          return (
            <div key={date} className="tl-thumb tl-thumb-placeholder tl-thumb--loading">
              <span className="tl-thumb-msg">Checking…</span>
              <span className="tl-thumb-date">{date}</span>
            </div>
          )
        })}
      </div>
      <div className="tl-browser-actions">
        <button
          type="button"
          className="tl-browser-btn tl-browser-btn--primary"
          onClick={onAddSelected}
          disabled={selectedCount === 0}
        >
          Add selected ({selectedCount})
        </button>
      </div>
    </>
  )

  return (
    <div className="tl-browser">
      <div className="tl-browser-header">
        <div className="tl-browser-title">Timelapse Images</div>
        <div className="tl-browser-layer">{layerName || 'No imagery layer active'}</div>
      </div>

      {!hasRect ? (
        <div className="tl-browser-hint">
          <Icon icon="fluent:crop-24-regular" width="30" height="30" />
          <p>Draw a crop box on the map to preview available images.</p>
        </div>
      ) : fetching ? (
        <div className="tl-browser-state">Loading available dates…</div>
      ) : visibleDates.length === 0 ? (
        <div className="tl-browser-state">No images found in this date range.</div>
      ) : confirmed ? (
        renderPreviewMode()
      ) : (
        renderListMode()
      )}
    </div>
  )
}

export default TimelapseBrowser
export { PREVIEW_PAGE }
