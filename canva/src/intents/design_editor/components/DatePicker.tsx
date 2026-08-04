import {
  Button,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "@canva/app-ui-kit";
import type { DateObj } from "../utils/gibs";
import { useIntl } from "react-intl";
import * as styles from "styles/components.css";

type DatePickerProps = {
  /** Currently selected date. */
  value: DateObj;
  /** Earliest selectable date. */
  min: DateObj;
  /** Latest selectable date. */
  max: DateObj;
  /** Called when the user picks a new date. */
  onChange: (value: DateObj) => void;
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Total days (serial number) for a `DateObj`, for fast comparisons. */
const dateObjToDays = (d: DateObj): number =>
  Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);

/** Clamp `value` to the inclusive `[min, max]` range. */
const clampDate = (value: DateObj, min: DateObj, max: DateObj): DateObj => {
  const v = dateObjToDays(value);
  if (v < dateObjToDays(min)) return min;
  if (v > dateObjToDays(max)) return max;
  return value;
};

/** Number of days in a given month (1-indexed). */
const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * A compact date stepper. Each field — day, month, year — has its own
 * up/down chevron buttons so the user can change any component individually.
 * Outer left/right chevrons still step a whole day at a time for convenience.
 * Constrained to the GIBS availability range `[min, max]`.
 */
export const DatePicker = ({ value, min, max, onChange }: DatePickerProps) => {
  const intl = useIntl();

  const atMin = dateObjToDays(value) <= dateObjToDays(min);
  const atMax = dateObjToDays(value) >= dateObjToDays(max);

  /** Step a single day by `delta`, rolling over month/year boundaries. */
  const stepDay = (delta: number) => {
    // Normalise through a real UTC Date so month-end wraps correctly:
    // e.g. 01 June − 1 day → 31 May, 01 Jan − 1 day → 31 Dec prev year.
    // (A naive `value.day + delta` would produce day 0 / −1.)
    const base = new Date(Date.UTC(value.year, value.month - 1, value.day));
    base.setUTCDate(base.getUTCDate() + delta);
    const next = {
      year: base.getUTCFullYear(),
      month: base.getUTCMonth() + 1,
      day: base.getUTCDate(),
    };
    onChange(clampDate(next, min, max));
  };

  /** Step the month by `delta`, clamping the day to the new month's length. */
  const stepMonth = (delta: number) => {
    let newMonth = value.month + delta;
    let newYear = value.year;

    // Wrap around the year boundary.
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }

    // Clamp the day to the new month's length (e.g. Jan 31 → Feb 28).
    const maxDay = daysInMonth(newYear, newMonth);
    const newDay = Math.min(value.day, maxDay);

    onChange(
      clampDate({ year: newYear, month: newMonth, day: newDay }, min, max),
    );
  };

  /** Step the year by `delta`, clamping the day to Feb's length on leap years. */
  const stepYear = (delta: number) => {
    const newYear = value.year + delta;

    // Clamp the day (handles Feb 29 on non-leap years).
    const maxDay = daysInMonth(newYear, value.month);
    const newDay = Math.min(value.day, maxDay);

    onChange(
      clampDate({ year: newYear, month: value.month, day: newDay }, min, max),
    );
  };

  const dayLabel = intl.formatMessage({
    defaultMessage: "Day",
    description: "Label for the day box in the date stepper.",
  });
  const monthLabel = intl.formatMessage({
    defaultMessage: "Month",
    description: "Label for the month box in the date stepper.",
  });
  const yearLabel = intl.formatMessage({
    defaultMessage: "Year",
    description: "Label for the year box in the date stepper.",
  });

  const prevDayLabel = intl.formatMessage({
    defaultMessage: "Previous day",
    description: "Accessible label for the date stepper's previous-day button.",
  });
  const nextDayLabel = intl.formatMessage({
    defaultMessage: "Next day",
    description: "Accessible label for the date stepper's next-day button.",
  });
  const dayUpLabel = intl.formatMessage({
    defaultMessage: "Increase day",
    description: "Accessible label for the date stepper's increase-day button.",
  });
  const dayDownLabel = intl.formatMessage({
    defaultMessage: "Decrease day",
    description: "Accessible label for the date stepper's decrease-day button.",
  });
  const monthUpLabel = intl.formatMessage({
    defaultMessage: "Increase month",
    description:
      "Accessible label for the date stepper's increase-month button.",
  });
  const monthDownLabel = intl.formatMessage({
    defaultMessage: "Decrease month",
    description:
      "Accessible label for the date stepper's decrease-month button.",
  });
  const yearUpLabel = intl.formatMessage({
    defaultMessage: "Increase year",
    description:
      "Accessible label for the date stepper's increase-year button.",
  });
  const yearDownLabel = intl.formatMessage({
    defaultMessage: "Decrease year",
    description:
      "Accessible label for the date stepper's decrease-year button.",
  });

  return (
    <div className={styles.dateStepper}>
      <Button
        variant="tertiary"
        size="small"
        icon={ChevronLeftIcon}
        ariaLabel={prevDayLabel}
        disabled={atMin}
        onClick={() => stepDay(-1)}
      />
      <div className={styles.dateStepperBoxes}>
        <div className={styles.dateStepperBox}>
          <Button
            variant="tertiary"
            size="small"
            icon={ChevronUpIcon}
            ariaLabel={dayUpLabel}
            disabled={atMax}
            onClick={() => stepDay(1)}
          />
          <div className={styles.dateStepperBoxText}>
            <span className={styles.dateStepperBoxValue}>
              {String(value.day).padStart(2, "0")}
            </span>
            <span className={styles.dateStepperBoxLabel}>{dayLabel}</span>
          </div>
          <Button
            variant="tertiary"
            size="small"
            icon={ChevronDownIcon}
            ariaLabel={dayDownLabel}
            disabled={atMin}
            onClick={() => stepDay(-1)}
          />
        </div>

        <div className={styles.dateStepperBox}>
          <Button
            variant="tertiary"
            size="small"
            icon={ChevronUpIcon}
            ariaLabel={monthUpLabel}
            disabled={atMax}
            onClick={() => stepMonth(1)}
          />
          <div className={styles.dateStepperBoxText}>
            <span className={styles.dateStepperBoxValue}>
              {MONTH_NAMES[value.month - 1]}
            </span>
            <span className={styles.dateStepperBoxLabel}>{monthLabel}</span>
          </div>
          <Button
            variant="tertiary"
            size="small"
            icon={ChevronDownIcon}
            ariaLabel={monthDownLabel}
            disabled={atMin}
            onClick={() => stepMonth(-1)}
          />
        </div>

        <div className={styles.dateStepperBox}>
          <Button
            variant="tertiary"
            size="small"
            icon={ChevronUpIcon}
            ariaLabel={yearUpLabel}
            disabled={atMax}
            onClick={() => stepYear(1)}
          />
          <div className={styles.dateStepperBoxText}>
            <span className={styles.dateStepperBoxValue}>{value.year}</span>
            <span className={styles.dateStepperBoxLabel}>{yearLabel}</span>
          </div>
          <Button
            variant="tertiary"
            size="small"
            icon={ChevronDownIcon}
            ariaLabel={yearDownLabel}
            disabled={atMin}
            onClick={() => stepYear(-1)}
          />
        </div>
      </div>
      <Button
        variant="tertiary"
        size="small"
        icon={ChevronRightIcon}
        ariaLabel={nextDayLabel}
        disabled={atMax}
        onClick={() => stepDay(1)}
      />
    </div>
  );
};
