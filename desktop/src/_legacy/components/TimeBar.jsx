import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import './TimeBar.css';

// Days in an ISO 8601 period (P1D, P8D, P1M, ...). Sub-daily (PT...) and
// daily periods both resolve to 1 since the timeline works at day resolution.
// Months/years are approximated; exact snap dates are stepped on the calendar.
const parsePeriod = (period) => {
  if (!period || period.startsWith('PT')) return { days: 1 };
  const m = period.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/);
  if (!m) return { days: 1 };
  const years = parseInt(m[1] || 0);
  const months = parseInt(m[2] || 0);
  const days = parseInt(m[3] || 0);
  return { years, months, days: years * 365 + months * 30 + days };
};

const TimeBar = ({ selectedDate, onDateChange, onGoToLast, availability }) => {
  const [isDragging, setIsDragging] = useState(false);
  const timelineRef = useRef(null);
  const timelineContainerRef = useRef(null);

  // Calculate date range (15 years back - covers most GIBS historical data)
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - 1); // Yesterday as max
  const startDate = new Date(2010, 0, 1); // Start from Jan 1, 2010

  // Calculate total days for high resolution timeline
  const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
  const pixelsPerDay = 5; // 5 pixels per day for visible daily resolution
  const timelineWidth = totalDays * pixelsPerDay;

  // Convert date to pixel position in timeline
  const dateToPixels = (date) => {
    const dateObj = new Date(date);
    const daysSinceStart = Math.floor((dateObj - startDate) / (1000 * 60 * 60 * 24));
    return daysSinceStart * pixelsPerDay;
  };

  // Convert pixel position to date
  const pixelsToDate = (pixels) => {
    const days = Math.floor(pixels / pixelsPerDay);
    const date = new Date(startDate);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  // Generate month markers for scrollable timeline
  const generateMonthMarkers = () => {
    const markers = [];
    let currentDate = new Date(startDate);
    currentDate.setDate(1); // Start of month

    while (currentDate <= endDate) {
      const pixels = dateToPixels(currentDate);
      const label = currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const shortLabel = currentDate.toLocaleDateString('en-US', { month: 'short' });
      const isYearStart = currentDate.getMonth() === 0;
      markers.push({ pixels, label, shortLabel, date: new Date(currentDate), isYearStart });

      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return markers;
  };

  const monthMarkers = generateMonthMarkers();

  // Availability bands and, for multi-day-period layers (8-day, 16-day,
  // monthly), tick marks on the exact snap dates where imagery exists.
  const { availabilityBands, snapTicks } = React.useMemo(() => {
    const bands = [];
    const ticks = [];
    if (!availability) return { availabilityBands: bands, snapTicks: ticks };

    for (const { start, end, period } of availability) {
      const intervalStart = new Date(start);
      const intervalEnd = new Date(end);
      if (intervalEnd < startDate || intervalStart > endDate) continue;

      const left = Math.max(0, dateToPixels(intervalStart));
      const right = Math.min(timelineWidth, dateToPixels(intervalEnd) + pixelsPerDay);
      bands.push({ left, width: Math.max(right - left, 2) });

      const { years = 0, months = 0, days } = parsePeriod(period);
      if (days > 1) {
        const snap = new Date(intervalStart);
        while (snap <= intervalEnd && snap <= endDate) {
          if (snap >= startDate) ticks.push(dateToPixels(snap));
          if (years || months) {
            snap.setFullYear(snap.getFullYear() + years);
            snap.setMonth(snap.getMonth() + months);
          } else {
            snap.setDate(snap.getDate() + days);
          }
        }
      }
    }
    return { availabilityBands: bands, snapTicks: ticks };
  }, [availability, timelineWidth]);

  // Handle timeline click
  const handleTimelineClick = (e) => {
    if (isDragging) return;

    if (!timelineRef.current || !timelineContainerRef.current) return;

    const containerRect = timelineContainerRef.current.getBoundingClientRect();
    const scrollLeft = timelineContainerRef.current.scrollLeft;
    const x = e.clientX - containerRect.left + scrollLeft;
    const pixels = Math.max(0, Math.min(timelineWidth, x));
    const newDate = pixelsToDate(pixels);
    onDateChange(newDate);
  };

  // Handle scrubber drag
  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleMouseMove = React.useCallback((e) => {
    if (!timelineRef.current || !timelineContainerRef.current) return;

    const containerRect = timelineContainerRef.current.getBoundingClientRect();
    const scrollLeft = timelineContainerRef.current.scrollLeft;
    const x = e.clientX - containerRect.left + scrollLeft;
    const pixels = Math.max(0, Math.min(timelineWidth, x));
    const newDate = pixelsToDate(pixels);
    onDateChange(newDate);
  }, [timelineWidth, onDateChange]);

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Auto-scroll timeline to keep selected date visible
  useEffect(() => {
    if (!timelineContainerRef.current) return;

    const scrubberPosition = dateToPixels(selectedDate);
    const containerWidth = timelineContainerRef.current.clientWidth;
    const scrollLeft = timelineContainerRef.current.scrollLeft;
    const scrollRight = scrollLeft + containerWidth;

    const edgeThreshold = 100;

    if (scrubberPosition < scrollLeft + edgeThreshold) {
      timelineContainerRef.current.scrollTo({
        left: Math.max(0, scrubberPosition - containerWidth / 2),
        behavior: 'smooth'
      });
    } else if (scrubberPosition > scrollRight - edgeThreshold) {
      timelineContainerRef.current.scrollTo({
        left: scrubberPosition - containerWidth / 2,
        behavior: 'smooth'
      });
    }
  }, [selectedDate]);

  const goToLast = () => {
    if (onGoToLast) onGoToLast();
    else onDateChange(endDate.toISOString().split('T')[0]);
  };

  const goToPreviousDay = () => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() - 1);
    if (currentDate >= startDate) {
      onDateChange(currentDate.toISOString().split('T')[0]);
    }
  };

  const goToNextDay = () => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + 1);
    if (currentDate <= endDate) {
      onDateChange(currentDate.toISOString().split('T')[0]);
    }
  };

  const handleYearChange = (e) => {
    const newYear = parseInt(e.target.value);
    const currentDate = new Date(selectedDate);
    currentDate.setFullYear(newYear);
    if (currentDate >= startDate && currentDate <= endDate) {
      onDateChange(currentDate.toISOString().split('T')[0]);
    }
  };

  const handleMonthChange = (e) => {
    const newMonth = parseInt(e.target.value);
    const currentDate = new Date(selectedDate);
    currentDate.setMonth(newMonth);
    if (currentDate >= startDate && currentDate <= endDate) {
      onDateChange(currentDate.toISOString().split('T')[0]);
    }
  };

  const handleDayChange = (e) => {
    const newDay = parseInt(e.target.value);
    const currentDate = new Date(selectedDate);
    currentDate.setDate(newDay);
    if (currentDate >= startDate && currentDate <= endDate) {
      onDateChange(currentDate.toISOString().split('T')[0]);
    }
  };

  const generateYearOptions = () => {
    const years = [];
    const currentYear = endDate.getFullYear();
    const startYear = startDate.getFullYear();
    for (let year = startYear; year <= currentYear; year++) {
      years.push(year);
    }
    return years;
  };

  const getDaysInMonth = () => {
    const date = new Date(selectedDate);
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const selectedDateObj = new Date(selectedDate);
  const selectedYear = selectedDateObj.getFullYear();
  const selectedMonth = selectedDateObj.getMonth();
  const selectedDay = selectedDateObj.getDate();
  const daysInMonth = getDaysInMonth();

  return (
    <div className="timebar">
      <button
        className="timebar-nav-btn timebar-prev-btn"
        onClick={goToPreviousDay}
        title="Previous day"
      >
        ◀
      </button>

      <button
        className="timebar-nav-btn timebar-next-btn"
        onClick={goToNextDay}
        title="Next day"
      >
        ▶
      </button>

      <div className="timebar-date-pickers">
        <select
          className="timebar-select timebar-year-select"
          value={selectedYear}
          onChange={handleYearChange}
        >
          {generateYearOptions().map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>

        <select
          className="timebar-select timebar-month-select"
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
          className="timebar-select timebar-day-select"
          value={selectedDay}
          onChange={handleDayChange}
        >
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
      </div>

      <div
        className="timebar-timeline-container"
        ref={timelineContainerRef}
      >
        <div
          className="timebar-timeline"
          ref={timelineRef}
          style={{ width: `${timelineWidth}px` }}
          onClick={handleTimelineClick}
        >
          {availabilityBands.length > 0 && (
            <div className="timebar-availability">
              {availabilityBands.map((band, i) => (
                <div
                  key={i}
                  className="timebar-availability-band"
                  style={{ left: `${band.left}px`, width: `${band.width}px` }}
                />
              ))}
              {snapTicks.map((left, i) => (
                <div
                  key={i}
                  className="timebar-availability-snap"
                  style={{ left: `${left}px` }}
                />
              ))}
            </div>
          )}

          <div className="timebar-ticks">
            {Array.from({ length: totalDays }).map((_, i) => {
              const isWeekMark = i % 7 === 0;
              const isMonthMark = i % 30 === 0;
              return (
                <div
                  key={i}
                  className={`timebar-tick ${isWeekMark ? 'week' : ''} ${isMonthMark ? 'month' : ''}`}
                  style={{ left: `${i * pixelsPerDay}px` }}
                />
              );
            })}
          </div>

          <div className="timebar-markers">
            {monthMarkers.map((marker, i) => (
              <div
                key={i}
                className={`timebar-marker ${marker.isYearStart ? 'year-start' : ''}`}
                style={{ left: `${marker.pixels}px` }}
              >
                <div className="timebar-marker-label">
                  {marker.isYearStart ? marker.label : marker.shortLabel}
                </div>
              </div>
            ))}
          </div>

          <div
            className="timebar-scrubber"
            style={{ left: `${dateToPixels(selectedDate)}px` }}
            onMouseDown={handleMouseDown}
          >
            <div className="timebar-scrubber-handle" />
            <div className="timebar-scrubber-line" />
          </div>
        </div>
      </div>

      <button
        className="timebar-nav-btn timebar-end-btn"
        onClick={goToLast}
        title="Jump to latest"
      >
        <Icon icon="fluent:next-20-filled" width="16" height="16" />
      </button>
    </div>
  );
};

export default TimeBar;
