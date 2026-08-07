import { useMemo } from 'react'
import { Icon } from '@iconify/react'
import './TimelapseBrowser.css'
import { buildWmsUrl } from '../config/tileUrl'

const PREVIEW_W = 256
const PREVIEW_PAGE = 60

// Right-hand panel showing low-res WMS previews of every available image in
// the chosen date range. Click thumbnails to select frames, then add them to
// the timeline in the sidebar.
const TimelapseBrowser = ({
  layerName,
  hasRect,
  bbox3857,
  wmsBaseUrl,
  layer,
  dates,
  limit,
  selected,
  onToggleSelect,
  onSelectVisible,
  onAddSelected,
  onLoadMore,
  fetching,
}) => {
  const visibleDates = dates.slice(0, limit)

  const aspect = useMemo(() => {
    if (!bbox3857) return 1
    const [minX, minY, maxX, maxY] = bbox3857
    return (maxX - minX) / Math.max(1e-6, maxY - minY)
  }, [bbox3857])

  const previewH = Math.max(1, Math.round(PREVIEW_W / Math.max(0.1, aspect)))

  const previewUrl = (date) =>
    layer && bbox3857
      ? buildWmsUrl({ wmsBaseUrl }, layer, bbox3857, PREVIEW_W, previewH, date)
      : ''

  const allVisibleSelected = visibleDates.length > 0 && visibleDates.every((d) => selected.has(d))
  const selectedCount = selected.size

  return (
    <div className="tl-browser">
      <div className="tl-browser-header">
        <div className="tl-browser-title">Timelapse Images</div>
        <div className="tl-browser-layer">{layerName || 'No imagery layer'}</div>
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
      ) : (
        <>
          <div className="tl-browser-toolbar">
            <button type="button" className="tl-browser-btn" onClick={onSelectVisible}>
              {allVisibleSelected ? 'Deselect visible' : 'Select visible'}
            </button>
            <button
              type="button"
              className="tl-browser-btn tl-browser-btn--primary"
              onClick={onAddSelected}
              disabled={selectedCount === 0}
            >
              Add selected ({selectedCount})
            </button>
          </div>
          <div className="tl-browser-count">
            {dates.length} available · showing {visibleDates.length}
          </div>
          <div className="tl-browser-grid">
            {visibleDates.map((date) => (
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
              </button>
            ))}
          </div>
          {dates.length > visibleDates.length && (
            <button type="button" className="tl-browser-btn tl-browser-loadmore" onClick={onLoadMore}>
              Load more ({dates.length - visibleDates.length} remaining)
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default TimelapseBrowser
export { PREVIEW_PAGE }
