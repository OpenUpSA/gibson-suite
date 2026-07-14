import React from 'react'
import './DateSelector.css'

const DateSelector = ({ selectedDate, onDateChange }) => {
  const handlePrevDay = () => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() - 1)
    onDateChange(date.toISOString().split('T')[0])
  }

  const handleNextDay = () => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + 1)
    onDateChange(date.toISOString().split('T')[0])
  }

  const handleDateInput = (e) => {
    onDateChange(e.target.value)
  }

  const handleToday = () => {
    const today = new Date().toISOString().split('T')[0]
    onDateChange(today)
  }

  return (
    <div className="date-selector">
      <div className="date-controls">
        <button 
          className="date-nav-btn"
          onClick={handlePrevDay}
          title="Previous day"
        >
          ◀
        </button>
        
        <input
          type="date"
          className="date-input"
          value={selectedDate}
          onChange={handleDateInput}
          max={new Date().toISOString().split('T')[0]}
        />
        
        <button 
          className="date-nav-btn"
          onClick={handleNextDay}
          title="Next day"
          disabled={selectedDate >= new Date().toISOString().split('T')[0]}
        >
          ▶
        </button>
      </div>
      
      <button 
        className="today-btn"
        onClick={handleToday}
        title="Go to today"
      >
        Today
      </button>
    </div>
  )
}

export default DateSelector
