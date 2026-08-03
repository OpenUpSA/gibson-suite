import { useIntl } from "react-intl";
import * as styles from "styles/calendar.css";
import type { DateObj } from "../utils/gibs";

type CalendarProps = {
  /** Currently selected date. */
  value: DateObj;
  /** Earliest selectable date. */
  min: DateObj;
  /** Latest selectable date. */
  max: DateObj;
  /** Called when the user picks a new date. */
  onChange: (value: DateObj) => void;
  /**
   * A `Set` of day numbers (1-31) that have imagery available in the current
   * month. If omitted, all days are marked as available.
   */
  availableDays?: Set<number>;
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

/** Compare two `DateObj`s for equality. */
const isSameDay = (a: DateObj, b: DateObj): boolean =>
  a.year === b.year && a.month === b.month && a.day === b.day;

/** Convert a `DateObj` to a comparable number (days since epoch). */
const dateObjToDays = ({ year, month, day }: DateObj): number =>
  new Date(year, month - 1, day).getTime() / 86_400_000;

/**
 * An always-visible calendar grid that marks which days have imagery available.
 *
 * The Canva UI Kit's `DateInput` renders a dropdown, not an open calendar, so
 * we build a lightweight month grid here using plain HTML/CSS (per the AGENTS.md
 * guidance, plain HTML/CSS is allowed to supplement the UI Kit when necessary).
 *
 * Because the ESLint config forbids native `<button>` elements, the interactive
 * cells use `<div role="button">` with keyboard handlers instead.
 */
export const Calendar = ({
  value,
  min,
  max,
  onChange,
  availableDays,
}: CalendarProps) => {
  const intl = useIntl();

  // Track the month being viewed (may differ from the selected date's month).
  const [viewYear, viewMonth] = [value.year, value.month];

  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
  const minDays = dateObjToDays(min);
  const maxDays = dateObjToDays(max);

  const monthName = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString(
    intl.locale,
    { month: "long", year: "numeric" },
  );

  // Build the grid: leading blanks + days
  const cells: ({ day: number } | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day });
  }

  // Navigation
  const goToPrevMonth = () => {
    let m = viewMonth - 1;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    // Clamp to min
    if (y < min.year || (y === min.year && m < min.month)) {
      y = min.year;
      m = min.month;
    }
    const day = Math.min(value.day, new Date(y, m, 0).getDate());
    onChange({ year: y, month: m, day });
  };

  const goToNextMonth = () => {
    let m = viewMonth + 1;
    let y = viewYear;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    // Clamp to max
    if (y > max.year || (y === max.year && m > max.month)) {
      y = max.year;
      m = max.month;
    }
    const day = Math.min(value.day, new Date(y, m, 0).getDate());
    onChange({ year: y, month: m, day });
  };

  const canGoPrev =
    viewYear > min.year || (viewYear === min.year && viewMonth > min.month);
  const canGoNext =
    viewYear < max.year || (viewYear === max.year && viewMonth < max.month);

  const prevLabel = intl.formatMessage({
    defaultMessage: "Previous month",
    description: "Aria label for the calendar's previous-month button.",
  });
  const nextLabel = intl.formatMessage({
    defaultMessage: "Next month",
    description: "Aria label for the calendar's next-month button.",
  });
  const chevronLeft = intl.formatMessage({
    defaultMessage: "\u2039",
    description: "Left-pointing chevron for the previous-month navigation.",
  });
  const chevronRight = intl.formatMessage({
    defaultMessage: "\u203A",
    description: "Right-pointing chevron for the next-month navigation.",
  });

  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHeader}>
        <div
          role="button"
          tabIndex={canGoPrev ? 0 : -1}
          className={styles.calendarNav}
          onClick={canGoPrev ? goToPrevMonth : undefined}
          aria-label={prevLabel}
          aria-disabled={!canGoPrev}
          onKeyDown={(e) => {
            if (canGoPrev && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              goToPrevMonth();
            }
          }}
        >
          {chevronLeft}
        </div>
        <span className={styles.calendarMonthName}>{monthName}</span>
        <div
          role="button"
          tabIndex={canGoNext ? 0 : -1}
          className={styles.calendarNav}
          onClick={canGoNext ? goToNextMonth : undefined}
          aria-label={nextLabel}
          aria-disabled={!canGoNext}
          onKeyDown={(e) => {
            if (canGoNext && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              goToNextMonth();
            }
          }}
        >
          {chevronRight}
        </div>
      </div>

      <div className={styles.calendarWeekdays}>
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className={styles.calendarWeekday}>
            {label}
          </span>
        ))}
      </div>

      <div className={styles.calendarGrid}>
        {cells.map((cell, i) => {
          if (!cell) {
            return (
              <span key={`blank-${i}`} className={styles.calendarCellBlank} />
            );
          }
          const { day } = cell;
          const dateObj = { year: viewYear, month: viewMonth, day };
          const days = dateObjToDays(dateObj);
          const isInRange = days >= minDays && days <= maxDays;
          const isAvailable = availableDays?.has(day) ?? true;
          const isSelected = isSameDay(dateObj, value);
          const isDisabled = !isInRange || !isAvailable;

          const cellClass = isSelected
            ? styles.calendarCellSelected
            : isDisabled
              ? styles.calendarCellDisabled
              : styles.calendarCell;

          return (
            <div
              key={`day-${day}`}
              role="button"
              tabIndex={isDisabled ? -1 : 0}
              className={cellClass}
              onClick={() => {
                if (!isDisabled) {
                  onChange(dateObj);
                }
              }}
              aria-disabled={isDisabled}
              aria-pressed={isSelected}
              onKeyDown={(e) => {
                if (!isDisabled && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onChange(dateObj);
                }
              }}
            >
              {day}
              {isAvailable && isInRange && !isSelected && (
                <span className={styles.calendarDot} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
