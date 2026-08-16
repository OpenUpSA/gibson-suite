import React from 'react'
import './DatePicker.css'

const DatePicker = ({ selectedDate, onDateChange, label, startYear = 2010 }) => {
  const today = new Date()
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() - 1)
  const startDate = new Date(startYear, 0, 1)

  const selectedDateObj = new Date(selectedDate)

  const generateYearOptions = () => {
    const years = []
    const currentYear = endDate.getFullYear()
    const startYear = startDate.getFullYear()
    for (let year = startYear; year <= currentYear; year++) {
      years.push(year)
    }
    return years
  }

  const getDaysInMonth = () => {
    const date = new Date(selectedDate)
    const year = date.getFullYear()
    const month = date.getMonth()
    return new Date(year, month + 1, 0).getDate()
  }

  const goToPreviousDay = () => {
    const currentDate = new Date(selectedDate)
    currentDate.setDate(currentDate.getDate() - 1)
    if (currentDate >= startDate) {
      onDateChange(currentDate.toISOString().split('T')[0])
    }
  }

  const goToNextDay = () => {
    const currentDate = new Date(selectedDate)
    currentDate.setDate(currentDate.getDate() + 1)
    if (currentDate <= endDate) {
      onDateChange(currentDate.toISOString().split('T')[0])
    }
  }

  const handleYearChange = (e) => {
    const newYear = parseInt(e.target.value)
    const currentDate = new Date(selectedDate)
    currentDate.setFullYear(newYear)
    if (currentDate >= startDate && currentDate <= endDate) {
      onDateChange(currentDate.toISOString().split('T')[0])
    }
  }

  const handleMonthChange = (e) => {
    const newMonth = parseInt(e.target.value)
    const currentDate = new Date(selectedDate)
    currentDate.setMonth(newMonth)
    if (currentDate >= startDate && currentDate <= endDate) {
      onDateChange(currentDate.toISOString().split('T')[0])
    }
  }

  const handleDayChange = (e) => {
    const newDay = parseInt(e.target.value)
    const currentDate = new Date(selectedDate)
    currentDate.setDate(newDay)
    if (currentDate >= startDate && currentDate <= endDate) {
      onDateChange(currentDate.toISOString().split('T')[0])
    }
  }

  const selectedYear = selectedDateObj.getFullYear()
  const selectedMonth = selectedDateObj.getMonth()
  const selectedDay = selectedDateObj.getDate()
  const daysInMonth = getDaysInMonth()

  return (
    <div className="datepicker">
      {label && <span className="datepicker-label">{label}</span>}
      <div className="datepicker-controls">
        <button
          className="datepicker-nav-btn"
          onClick={goToPreviousDay}
          title="Previous day"
        >
          ◀
        </button>

        <select
          className="datepicker-select datepicker-year-select"
          value={selectedYear}
          onChange={handleYearChange}
        >
          {generateYearOptions().map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>

        <select
          className="datepicker-select datepicker-month-select"
          value={selectedMonth}
          onChange={handleMonthChange}
        >
          <option value="0">Jan</option>
          <option value="1">Feb</option>
          <option value="2">Mar</option>
          <option value="3">Apr</option>
          <option value="4">May</option>
          <option value="5">Jun</option>
          <option value="6">Jul</option>
          <option value="7">Aug</option>
          <option value="8">Sep</option>
          <option value="9">Oct</option>
          <option value="10">Nov</option>
          <option value="11">Dec</option>
        </select>

        <select
          className="datepicker-select datepicker-day-select"
          value={selectedDay}
          onChange={handleDayChange}
        >
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>

        <button
          className="datepicker-nav-btn"
          onClick={goToNextDay}
          title="Next day"
        >
          ▶
        </button>
      </div>
    </div>
  )
}

export default DatePicker
