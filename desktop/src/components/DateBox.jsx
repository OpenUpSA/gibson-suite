import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import './DateBox.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// Parse an ISO date (yyyy-mm-dd) as LOCAL time — avoids the UTC-midnight
// off-by-one that `new Date('yyyy-mm-dd')` causes in negative-offset zones.
// Parse an ISO date (yyyy-mm-dd) as LOCAL time — avoids the UTC-midnight
// off-by-one that `new Date('yyyy-mm-dd')` causes in negative-offset zones.
export const parseIso = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const toIso = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Strict ISO parse — returns null for anything that isn't a real yyyy-mm-dd.
export const parseIsoSafe = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const date = new Date(y, mo, d)
  if (date.getFullYear() === y && date.getMonth() === mo && date.getDate() === d) return date
  return null
}

/**
 * Editable date field: a text input (yyyy-mm-dd) plus a ▾ caret that opens
 * the popup calendar. Typing a valid date commits on blur/Enter; invalid
 * input reverts to the current date.
 */
export const DateBoxField = ({ value, onDraftChange, onCommit, onOpenPicker, title = 'Type a date (yyyy-mm-dd)' }) => (
  <div className="datebox">
    <input
      type="text"
      className="datebox-input"
      value={value}
      onChange={(e) => onDraftChange(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          onCommit()
          e.currentTarget.blur()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      spellCheck={false}
      autoComplete="off"
      title={title}
    />
    <button type="button" className="datebox-caret-btn" onClick={onOpenPicker} title="Open calendar">▾</button>
  </div>
)

/**
 * Compact date box: editable yyyy-mm-dd text + popup calendar with month
 * ◀ ▶ navigation and day selection, plus day-step ◀ ▶ in the footer.
 */
const DateBox = ({ selectedDate, onDateChange, startYear = 2010, showStepButtons = false }) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const [draft, setDraft] = useState(null) // text being typed; null = not editing
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseIso(selectedDate)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  // Keep the grid in sync with the selected date (e.g. day-stepping across a
  // month boundary while the popup stays open).
  useEffect(() => {
    const d = parseIso(selectedDate)
    setViewMonth({ y: d.getFullYear(), m: d.getMonth() })
  }, [selectedDate])

  const today = new Date()
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() - 1)
  const minDate = new Date(startYear, 0, 1)

  const selected = parseIso(selectedDate)

  // Close when clicking outside the box or popup.
  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (!e.target.closest('.datebox') && !e.target.closest('.datebox-popup')) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const value = draft !== null ? draft : selectedDate

  // Commit typed text: a valid yyyy-mm-dd (in range) applies, anything else
  // reverts to the current date.
  const commitDraft = () => {
    if (draft === null) return
    const date = parseIsoSafe(draft)
    if (date) onDateChange(toIso(clamp(date)))
    setDraft(null)
  }

  const openPicker = (e) => {
    const box = e.currentTarget.closest('.datebox')
    const rect = box.getBoundingClientRect()
    setPos({ x: rect.left + rect.width / 2, y: rect.bottom })
    const d = parseIsoSafe(value) || parseIso(selectedDate)
    setViewMonth({ y: d.getFullYear(), m: d.getMonth() })
    setOpen(true)
  }

  const clamp = (d) => {
    if (d < minDate) return minDate
    if (d > maxDate) return maxDate
    return d
  }

  const stepDay = (delta) => {
    const d = new Date(selected)
    d.setDate(d.getDate() + delta)
    onDateChange(toIso(clamp(d)))
  }

  const stepMonth = (delta) => {
    setViewMonth(prev => {
      const d = new Date(prev.y, prev.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const daysInMonth = new Date(viewMonth.y, viewMonth.m + 1, 0).getDate()
  const firstCol = (new Date(viewMonth.y, viewMonth.m, 1).getDay() + 6) % 7 // Monday-first

  const cells = []
  for (let i = 0; i < firstCol; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)

  const isSelected = (day) =>
    selected.getFullYear() === viewMonth.y && selected.getMonth() === viewMonth.m && selected.getDate() === day

  const isToday = (day) =>
    today.getFullYear() === viewMonth.y && today.getMonth() === viewMonth.m && today.getDate() === day

  const isDisabled = (day) => {
    const d = new Date(viewMonth.y, viewMonth.m, day)
    return d < minDate || d > maxDate
  }

  const pickDay = (day) => {
    onDateChange(toIso(new Date(viewMonth.y, viewMonth.m, day)))
    setDraft(null)
    setOpen(false)
  }

  const box = (
    <DateBoxField
      value={value}
      onDraftChange={setDraft}
      onCommit={commitDraft}
      onOpenPicker={openPicker}
    />
  )

  return (
    <>
      {showStepButtons ? (
        <div className="datebox-row">
          <button type="button" className="datebox-step-btn" onClick={() => stepDay(-1)} title="Previous day">◀</button>
          {box}
          <button type="button" className="datebox-step-btn" onClick={() => stepDay(1)} title="Next day">▶</button>
        </div>
      ) : box}

      {open && pos && createPortal(
        <div
          className="datebox-popup"
          style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translate(-50%, 6px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="datebox-popup-header">
            <button type="button" className="datebox-popup-nav" onClick={() => stepMonth(-1)} title="Previous month">◀</button>
            <span className="datebox-popup-month">{MONTHS[viewMonth.m]} {viewMonth.y}</span>
            <button type="button" className="datebox-popup-nav" onClick={() => stepMonth(1)} title="Next month">▶</button>
          </div>

          <div className="datebox-popup-grid">
            {DAY_NAMES.map(n => <span key={n} className="datebox-popup-dow">{n}</span>)}
            {cells.map((day, i) => day === null
              ? <span key={`e${i}`} className="datebox-popup-empty" />
              : (
                <button
                  key={day}
                  type="button"
                  className={`datebox-popup-day${isSelected(day) ? ' selected' : ''}${isToday(day) ? ' today' : ''}`}
                  disabled={isDisabled(day)}
                  onClick={() => pickDay(day)}
                >
                  {day}
                </button>
              )
            )}
          </div>

          <div className="datebox-popup-footer">
            <button type="button" className="datebox-popup-nav" onClick={() => stepDay(-1)} title="Previous day">◀</button>
            <span className="datebox-popup-date">{selectedDate}</span>
            <button type="button" className="datebox-popup-nav" onClick={() => stepDay(1)} title="Next day">▶</button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default DateBox