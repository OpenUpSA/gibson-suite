import { useMemo } from 'react'
import { Icon } from '@iconify/react'
import './TimelapseBrowser.css'
import { buildWmsUrl } from '../config/tileUrl'

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
  onFetch,
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

  // Keep previews a sane, visible size. For wide crops (large aspect) the old
  // formula collapsed the height toward 1px, leaving near-invisible thumbnails;
  // clamp to [72, 200] so images always show.
  const previewH = Math.min(200, Math.max(72, Math.round(PREVIEW_W / Math.max(0.1, aspect))))

  // Per-layer preview URL. Renders ONE layer for the given date (reference
  // overlays use GIBS 'default' time). Rendering one layer per image — instead
  // of compositing every active layer in a single request — reliably produces
  // non-blank thumbnails (the multi-layer composite previously rendered empty).
  const layerPreviewUrl = (layerEntry, date) =>
    bbox3857
      ? buildWmsUrl(
          { wmsBaseUrl },
          layerEntry.layer,
          bbox3857,
          PREVIEW_W,
          previewH,
          layerEntry.role === 'reference' ? 'default' : date,
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
        <button
          type="button"
          className="tl-browser-btn tl-browser-btn--primary tl-browser-btn--auto"
          onClick={onFetch}
          disabled={fetching}
        >
          {fetching ? 'Fetching…' : 'Fetch available dates'}
        </button>
      </div>
      <div className="tl-browser-toolbar">
        <button type="button" className="tl-browser-btn" onClick={onSelectVisible} disabled={visibleDates.length === 0}>
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
        <button type="button" className="tl-browser-btn tl-browser-loadmore tl-browser-btn--auto" onClick={onLoadMore}>
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
      <div className="tl-browser-groups">
        {selectedDates.map((date) => {
          const s = status?.get(date)
          const cov = coverageFor(date)
          const groupClass = `tl-date-group${selected.has(date) ? ' selected' : ''}`
          const header = (
            <button
              type="button"
              className="tl-date-group-header"
              onClick={() => onToggleSelect(date)}
              title={date}
            >
              <span className="tl-date-group-check">
                {selected.has(date) ? (
                  <Icon icon="fluent:checkmark-20-filled" width="14" height="14" />
                ) : null}
              </span>
              <span className="tl-date-group-date">{date}</span>
            </button>
          )

          // Not yet probed / still loading → show a single pending placeholder.
          if (s === 'loading' || (!s && busy)) {
            return (
              <div key={date} className={groupClass}>
                {header}
                <div className="tl-date-group-layers">
                  <div className="tl-layer-thumb tl-thumb-placeholder tl-thumb--loading">
                    <span className="tl-thumb-msg">Checking…</span>
                  </div>
                </div>
              </div>
            )
          }
          if (s === 'error') {
            return (
              <div key={date} className={groupClass}>
                {header}
                <div className="tl-date-group-layers">
                  <div className="tl-layer-thumb tl-thumb-placeholder tl-thumb--error">
                    <span className="tl-thumb-msg">Failed</span>
                  </div>
                </div>
              </div>
            )
          }

          // Probed (ok or empty): one thumbnail per active layer.
          return (
            <div key={date} className={groupClass}>
              {header}
              <div className="tl-date-group-layers">
                {layers.map((layerEntry) => {
                  const isReference = layerEntry.role === 'reference'
                  const isBase = layerEntry.role === 'base'
                  // Reference + base layers are always available (no per-date
                  // coverage probe), so always render them. Imagery layers
                  // only render when the probe found data for this date.
                  const has = isReference || isBase ? true : cov?.get(layerEntry.layer.id)
                  const layerId = layerEntry.layer.id
                  if (has) {
                    return (
                      <div
                        key={layerId}
                        className="tl-layer-thumb"
                        title={`${layerId} · ${date}`}
                      >
                        <img
                          src={layerPreviewUrl(layerEntry, date)}
                          alt={`${layerId} ${date}`}
                          loading="lazy"
                        />
                        <span className="tl-layer-thumb-badge tl-badge-ok">{layerId}</span>
                      </div>
                    )
                  }
                  return (
                    <div
                      key={layerId}
                      className="tl-layer-thumb tl-thumb-placeholder tl-thumb--nodata"
                      title={`${layerId} · no data`}
                    >
                      <span className="tl-thumb-msg">No data</span>
                      <span className="tl-layer-thumb-badge tl-badge-empty">{layerId}</span>
                    </div>
                  )
                })}
              </div>
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
        <div className="tl-browser-state">
          <p>No images loaded yet.</p>
          <button
            type="button"
            className="tl-browser-btn tl-browser-btn--primary tl-browser-btn--auto"
            onClick={onFetch}
            disabled={fetching}
          >
            {fetching ? 'Fetching…' : 'Fetch available dates'}
          </button>
        </div>
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
