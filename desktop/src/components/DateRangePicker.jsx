import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { DateBoxField, parseIso, parseIsoSafe, toIso } from './DateBox'
import './DateBox.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// One calendar grid bound to a single date — used twice in the range popup.
const Calendar = ({ selectedDate, onDateChange, startYear }) => {
  const today = new Date()
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() - 1)
  const minDate = new Date(startYear, 0, 1)

  const selected = parseIso(selectedDate)
  const [viewMonth, setViewMonth] = useState(() => ({ y: selected.getFullYear(), m: selected.getMonth() }))

  // Keep the grid in sync with the selected date (e.g. day-stepping across a
  // month boundary while the popup stays open).
  useEffect(() => {
    setViewMonth({ y: selected.getFullYear(), m: selected.getMonth() })
  }, [selectedDate])

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
  }

  return (
    <div className="datebox-calendar">
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
    </div>
  )
}

/**
 * Start/end date range for the timelapse: two yyyy-mm-dd boxes in one row.
 * Clicking either box opens ONE popup showing BOTH calendars side by side,
 * so the whole range can be adjusted in one place. Picking a day keeps the
 * popup open; click outside to close.
 */
const DateRangePicker = ({ startDate, endDate, onStartDateChange, onEndDateChange, startYear = 2000 }) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const [startDraft, setStartDraft] = useState(null) // text being typed; null = not editing
  const [endDraft, setEndDraft] = useState(null)

  const today = new Date()
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() - 1)
  const minDate = new Date(startYear, 0, 1)

  const clamp = (d) => {
    if (d < minDate) return minDate
    if (d > maxDate) return maxDate
    return d
  }

  const commitStart = () => {
    if (startDraft === null) return
    const date = parseIsoSafe(startDraft)
    if (date) onStartDateChange(toIso(clamp(date)))
    setStartDraft(null)
  }

  const commitEnd = () => {
    if (endDraft === null) return
    const date = parseIsoSafe(endDraft)
    if (date) onEndDateChange(toIso(clamp(date)))
    setEndDraft(null)
  }

  // Close when clicking outside the boxes or popup.
  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (!e.target.closest('.datebox') && !e.target.closest('.datebox-popup')) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const openPicker = (e) => {
    const row = e.currentTarget.closest('.datebox-row')
    const rect = (row || e.currentTarget).getBoundingClientRect()
    setPos({ x: rect.left, y: rect.bottom })
    setOpen(true)
  }

  return (
    <>
      <div className="datebox-row datebox-row--range">
        <DateBoxField
          value={startDraft !== null ? startDraft : startDate}
          onDraftChange={setStartDraft}
          onCommit={commitStart}
          onOpenPicker={openPicker}
          title="Start date — type yyyy-mm-dd"
        />
        <span className="datebox-range-sep">–</span>
        <DateBoxField
          value={endDraft !== null ? endDraft : endDate}
          onDraftChange={setEndDraft}
          onCommit={commitEnd}
          onOpenPicker={openPicker}
          title="End date — type yyyy-mm-dd"
        />
      </div>

      {open && pos && createPortal(
        <div
          className="datebox-popup datebox-popup--range"
          style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translate(0, 6px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Calendar
            selectedDate={startDate}
            onDateChange={(d) => { setStartDraft(null); onStartDateChange(d) }}
            startYear={startYear}
          />
          <Calendar
            selectedDate={endDate}
            onDateChange={(d) => { setEndDraft(null); onEndDateChange(d) }}
            startYear={startYear}
          />
        </div>,
        document.body
      )}
    </>
  )
}

export default DateRangePicker