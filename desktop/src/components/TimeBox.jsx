import { useEffect, useState } from 'react'
import { nearestValue, normalizeHHMM } from '../utils/timeFormat'
import './TimeBox.css'

/**
 * Time-of-day control for sub-daily layers (precipitation, GOES, …).
 *
 * Rendered only when the view actually has a sub-daily layer on the map, so
 * daily-only views are unchanged. Everything is UTC: the label says so, and
 * the field accepts `19:40`, `1940` or an empty value.
 *
 * - Empty / "auto" → Auto mode: the newest frame of the selected day. That is
 *   what makes the control useful without typing anything.
 * - ◀ ▶ step by the layer's own cadence (30 min for IMERG, 10 for GOES) and
 *   roll the date over midnight through `onStep`.
 * - "Latest" jumps to the newest imagery the layer has (parent handles it).
 *
 * `frames` is the real frame list for the selected day (from GIBS' own
 * availability runs), used to tell the user when a typed time has no exact
 * frame — GIBS snaps to the nearest, so the value is still usable.
 */
const TimeBox = ({
  value,
  auto = false,
  stepMinutes = 30,
  frames = [],
  onChange,
  onStep,
  onLatest,
  showLatest = true,
  compact = false
}) => {
  const [draft, setDraft] = useState(null)

  // Reset the text being edited whenever the value changes underneath us
  // (e.g. the Auto frame resolved, or the date changed).
  useEffect(() => {
    setDraft(null)
  }, [value])

  const shown = draft !== null ? draft : (value || '')

  const commit = () => {
    if (draft === null) return
    const text = draft.trim().toLowerCase()
    setDraft(null)
    if (!text || text === 'auto') onChange(null)
    else {
      const normalized = normalizeHHMM(text)
      if (normalized) onChange(normalized)
    }
  }

  const exact = Boolean(value && frames.includes(value))
  const nearest = value && frames.length && !exact ? nearestValue(frames, value) : null

  const hint = auto
    ? (frames.length ? `Newest frame · ${frames.length} frames this day` : 'Newest frame of the day')
    : nearest
      ? `No frame at ${value}Z — nearest is ${nearest}Z`
      : frames.length
        ? `${frames.length} frames this day`
        : 'No frames for this day'

  return (
    <div className={`timebox${compact ? ' timebox--compact' : ''}`}>
      <div className="timebox-row">
        <button
          type="button"
          className="timebox-step"
          onClick={() => onStep(-stepMinutes)}
          title={`Back ${stepMinutes} minutes`}
          aria-label={`Back ${stepMinutes} minutes`}
        >
          ◀
        </button>
        <div className="timebox-field">
          <input
            type="text"
            className="timebox-input"
            value={shown}
            placeholder="--:--"
            inputMode="numeric"
            maxLength={5}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                commit()
                e.currentTarget.blur()
              }
            }}
            title="Time of day in UTC — type a time, or leave empty to follow the newest frame"
          />
          <span className="timebox-zone">UTC</span>
        </div>
        <button
          type="button"
          className="timebox-step"
          onClick={() => onStep(stepMinutes)}
          title={`Forward ${stepMinutes} minutes`}
          aria-label={`Forward ${stepMinutes} minutes`}
        >
          ▶
        </button>
        {showLatest && (
          <button
            type="button"
            className="timebox-latest"
            onClick={onLatest}
            title="Jump to the newest imagery available"
          >
            Latest
          </button>
        )}
      </div>
      {!compact && (
        <div className={`timebox-hint${auto ? ' timebox-hint--auto' : ''}`}>
          {auto && <span className="timebox-auto-tag">auto</span>}
          {hint}
        </div>
      )}
    </div>
  )
}

export default TimeBox
